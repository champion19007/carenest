import 'server-only'
import {randomUUID} from 'node:crypto'
import {getDb,ensureSchema,type Db} from '@/lib/db/client'
import {payoutsConfigured,verifiedBeneficiary,createTransfer,transferStatus,assertTransfer} from '@/lib/cashfree-payouts'
import {decimalRupees} from '@/lib/money'
import {lockPaymentAppointment} from './bookings'
import {reject,DomainError} from './errors'

type Payout={id:string;booking_id:string;invoice_id:string;payment_id:string;doctor_id:string;clinic_id:string;amount_paise:string;currency:string;beneficiary_id:string|null;provider_id:string|null;state:string;submitted_at:string|null;lease_token:string|null}
async function administrator(tx:Db,id:string){if(!await tx.one('SELECT id FROM admins WHERE id=$1 AND totp_secret IS NOT NULL',[id]))reject('FORBIDDEN','An authenticated administrator with two-factor setup is required.',403)}
export async function bindDoctorBeneficiary(adminId:string,doctorId:string,beneficiaryId:string,attested:boolean){
 if(!attested)reject('ATTESTATION','Confirm the beneficiary belongs to this doctor.',400)
 await ensureSchema();await getDb().transaction(tx=>administrator(tx,adminId))
 await verifiedBeneficiary(beneficiaryId)
 await getDb().transaction(async tx=>{
  await administrator(tx,adminId)
  if(!await tx.one("SELECT d.id FROM provider.doctors d JOIN patient.users u ON u.id=d.user_id WHERE d.id=$1 AND d.status='ACTIVE' AND u.status='ACTIVE' AND u.role='doctor' AND u.kyc_level='verified' AND d.verified_at IS NOT NULL FOR UPDATE OF d",[doctorId]))reject('DOCTOR','An active verified doctor account is required.')
  if(await tx.one("SELECT id FROM doctor_payouts WHERE doctor_id=$1 AND submitted_at IS NOT NULL AND state IN ('SUBMITTING','UNKNOWN','PENDING')",[doctorId]))reject('IN_FLIGHT','Reconcile pending transfers before changing the beneficiary.')
  await tx.query('INSERT INTO doctor_payout_accounts(doctor_id,beneficiary_id,verified_by) VALUES($1,$2,$3) ON CONFLICT(doctor_id) DO UPDATE SET beneficiary_id=$2,verified_by=$3,verified_at=now()',[doctorId,beneficiaryId,adminId])
  await tx.query("UPDATE doctor_payouts SET next_check_at=now() WHERE doctor_id=$1 AND state='WAITING_SETUP'",[doctorId])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'payout:beneficiary_verified',$2)",[adminId,doctorId])
 })
}
// Completion creates a durable obligation. Gateway capture alone never pays a doctor.
export async function queueDoctorPayouts(){
 await ensureSchema()
 await getDb().query(`INSERT INTO doctor_payouts(id,booking_id,invoice_id,payment_id,doctor_id,clinic_id,amount_paise)
 SELECT 'dp_'||replace(gen_random_uuid()::text,'-',''),b.id,i.id,p.id,d.id,d.clinic_id,b.fee::bigint*100
 FROM patient.bookings b JOIN clinic.invoices i ON i.booking_id=b.id JOIN payment_orders p ON p.invoice_id=i.id
 JOIN provider.doctors d ON d.id=b.doctor_id WHERE b.status='attended' AND i.state='PAID' AND p.state='CAPTURED'
 AND p.gateway='cashfree' AND b.slot_id IS NOT NULL AND b.fee>=1 AND d.user_id IS NOT NULL AND d.clinic_id IS NOT NULL
 ON CONFLICT(booking_id) DO NOTHING`)
}
async function eligible(tx:Db,p:Payout){
 const booking=await lockPaymentAppointment(tx,p.booking_id)
 const i=await tx.one<{state:string}>('SELECT state FROM clinic.invoices WHERE id=$1 FOR UPDATE',[p.invoice_id])
 const payment=await tx.one<{state:string;amount_paise:string}>('SELECT state,amount_paise FROM payment_orders WHERE id=$1',[p.payment_id])
 const doctor=await tx.one("SELECT d.id FROM provider.doctors d JOIN patient.users u ON u.id=d.user_id JOIN clinic.clinics c ON c.id=d.clinic_id WHERE d.id=$1 AND d.status='ACTIVE' AND d.verified_at IS NOT NULL AND u.role='doctor' AND u.kyc_level='verified' AND u.status='ACTIVE' AND c.status='ACTIVE'",[p.doctor_id])
 const refund=await tx.one("SELECT id FROM refunds WHERE payment_id=$1 AND state NOT IN ('REJECTED','CANCELLED','FAILED') LIMIT 1",[p.payment_id])
 return booking.b.status==='attended'&&i?.state==='PAID'&&payment?.state==='CAPTURED'&&BigInt(payment.amount_paise)>=BigInt(p.amount_paise)&&!!doctor&&!refund
}
async function postPayout(tx:Db,p:Payout,reversed=false){
 const effect=(reversed?'payout-reversal:':'payout:')+p.id
 if(reversed&&!await tx.one('SELECT effect_key FROM financial_effects WHERE effect_key=$1',['payout:'+p.id]))return
 if(!await tx.one('INSERT INTO financial_effects(effect_key,invoice_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING effect_key',[effect,p.invoice_id]))return
 const revenue='revenue:'+p.clinic_id,bank='doctor-payout:cashfree:'+p.clinic_id
 await tx.query("INSERT INTO ledger_accounts(account_id,account_type,owner_id) VALUES($1,'PAYOUT_CLEARING',$2) ON CONFLICT DO NOTHING",[bank,p.clinic_id])
 const debit=reversed?bank:revenue,credit=reversed?revenue:bank
 await tx.query("INSERT INTO ledger_entries(entry_id,transaction_id,account_id,direction,amount,amount_paise) VALUES($1,$2,$3,'DEBIT',$4,$5),($6,$2,$7,'CREDIT',$4,$5)",['entry_'+randomUUID(),effect,debit,decimalRupees(String(p.amount_paise)),String(p.amount_paise),'entry_'+randomUUID(),credit])
 await tx.query('UPDATE ledger_accounts SET balance_paise=balance_paise-$2::bigint WHERE account_id=$1',[debit,String(p.amount_paise)])
 await tx.query('UPDATE ledger_accounts SET balance_paise=balance_paise+$2::bigint WHERE account_id=$1',[credit,String(p.amount_paise)])
}
export async function processDoctorPayout(id:string){
 await ensureSchema()
 const initial=await getDb().one<Payout>('SELECT * FROM doctor_payouts WHERE id=$1',[id]);if(!initial)return
 const claim=await getDb().transaction(async tx=>{
  const allowed=await eligible(tx,initial)
  const p=await tx.one<Payout>('SELECT * FROM doctor_payouts WHERE id=$1 FOR UPDATE',[id]);if(!p||['FAILED','REVERSED'].includes(p.state))return null
  if(await tx.one('SELECT id FROM doctor_payouts WHERE id=$1 AND lease_until>clock_timestamp()',[id]))return null
  if(!p.submitted_at&&!allowed){await tx.query("UPDATE doctor_payouts SET state='BLOCKED_REFUND',next_check_at=now()+interval '5 minutes' WHERE id=$1",[id]);return null}
  const account=await tx.one<{beneficiary_id:string}>('SELECT beneficiary_id FROM doctor_payout_accounts WHERE doctor_id=$1',[p.doctor_id])
  if(!payoutsConfigured()||(!p.submitted_at&&!account)){await tx.query("UPDATE doctor_payouts SET state=CASE WHEN submitted_at IS NULL THEN 'WAITING_SETUP' ELSE state END,next_check_at=now()+interval '1 minute' WHERE id=$1",[id]);return null}
  const token=randomUUID(),beneficiary=p.submitted_at?p.beneficiary_id!:account!.beneficiary_id
  await tx.query("UPDATE doctor_payouts SET beneficiary_id=$2,state=CASE WHEN submitted_at IS NULL THEN 'SUBMITTING' ELSE state END,submitted_at=coalesce(submitted_at,now()),lease_token=$3,lease_until=now()+interval '60 seconds',updated_at=now() WHERE id=$1",[id,beneficiary,token])
  return {...p,beneficiary_id:beneficiary,lease_token:token,fresh:!p.submitted_at}
 })
 if(!claim)return
 try{
  // A lost POST response is reconciled by this same transfer ID; never mint another.
  const evidence=claim.fresh?await createTransfer(claim.id,claim.beneficiary_id,String(claim.amount_paise)):await transferStatus(claim.id)
  assertTransfer(evidence,claim.id,claim.beneficiary_id,String(claim.amount_paise))
  await getDb().transaction(async tx=>{
   await lockPaymentAppointment(tx,claim.booking_id);await tx.query('SELECT id FROM clinic.invoices WHERE id=$1 FOR UPDATE',[claim.invoice_id])
   const p=await tx.one<Payout>('SELECT * FROM doctor_payouts WHERE id=$1 AND lease_token=$2 FOR UPDATE',[id,claim.lease_token]);if(!p)return
   // SUCCESS/SENT_TO_BENEFICIARY is not proof the doctor's bank has credited it.
   if(p.provider_id&&p.provider_id!==String(evidence.cf_transfer_id))reject('PAYOUT_MISMATCH','The saved provider transfer reference changed.',502)
   let state=evidence.status==='SUCCESS'&&evidence.status_code==='COMPLETED'?'PAID':evidence.status==='REVERSED'?'REVERSED':['FAILED','REJECTED'].includes(evidence.status)?'FAILED':'PENDING'
   if(p.state==='PAID'&&state!=='REVERSED')state='PAID'
   if(state==='PAID')await postPayout(tx,p)
   if(state==='REVERSED')await postPayout(tx,p,true)
   await tx.query("UPDATE doctor_payouts SET state=$2,provider_id=$3,status_code=$4,paid_at=CASE WHEN $2='PAID' THEN coalesce(paid_at,now()) ELSE paid_at END,lease_token=NULL,lease_until=NULL,next_check_at=now()+CASE WHEN $2='PAID' THEN interval '1 day' ELSE interval '1 minute' END,updated_at=now() WHERE id=$1",[id,state,String(evidence.cf_transfer_id),String(evidence.status_code??'').slice(0,100)])
   if(p.state!==state)await tx.query("INSERT INTO audit_log(action,resource,detail) VALUES('payout:provider_status',$1,$2::jsonb)",[id,JSON.stringify({state})])
   if(p.state!==state&&['PAID','REVERSED'].includes(state)){
    const doctor=await tx.one<{user_id:string|null}>('SELECT user_id FROM provider.doctors WHERE id=$1',[p.doctor_id])
    if(doctor?.user_id)await tx.query("INSERT INTO domain_events(kind,subject_id,payload,event_key) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT DO NOTHING",[state==='PAID'?'doctor.payout_paid':'doctor.payout_reversed',p.id,JSON.stringify({userId:doctor.user_id}),'payout:'+p.id+':'+state])
   }
  })
 }catch(error){
  const noSubmission=claim.fresh&&error instanceof DomainError&&error.code==='PAYOUT_DESTINATION'
  await getDb().query("UPDATE doctor_payouts SET state=CASE WHEN state='PAID' THEN state WHEN $4::boolean THEN 'WAITING_SETUP' ELSE 'UNKNOWN' END,submitted_at=CASE WHEN $4::boolean THEN NULL ELSE submitted_at END,status_code=$3,lease_token=NULL,lease_until=NULL,next_check_at=now()+interval '2 minutes',updated_at=now() WHERE id=$1 AND lease_token=$2",[id,claim.lease_token,error instanceof DomainError?error.code:'PAYOUT_UNKNOWN',noSubmission])
 }
}
export async function runDoctorPayouts(limit=2){
 await queueDoctorPayouts()
 const rows=await getDb().query<{id:string}>("SELECT id FROM doctor_payouts WHERE state NOT IN ('FAILED','REVERSED') AND next_check_at<=now() AND (lease_until IS NULL OR lease_until<=now()) ORDER BY next_check_at,id LIMIT $1",[Math.min(2,Math.max(0,limit))])
 for(const row of rows)await processDoctorPayout(row.id)
 return rows.length
}
export async function doctorPayoutHistory(actorId:string){await ensureSchema();return getDb().query<Payout>(`SELECT p.* FROM doctor_payouts p JOIN provider.doctors d ON d.id=p.doctor_id JOIN patient.users u ON u.id=d.user_id WHERE u.id=$1 AND u.role='doctor' AND u.status='ACTIVE' AND u.kyc_level='verified' ORDER BY p.created_at DESC LIMIT 100`,[actorId])}
