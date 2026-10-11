import 'server-only'
import {randomUUID} from 'node:crypto'
import {getDb,ensureSchema,type Db} from '@/lib/db/client'
import {localMode} from '@/lib/secrets'
import {paise,decimalRupees} from '@/lib/money'
import {boundedText,reject,DomainError} from './errors'
import {cashfreeConfigured,cashfreeRequest,cashfreeOrder,cashfreePayment,cashfreeAmount} from '@/lib/cashfree'
import {lockPaymentAppointment,confirmPaidAppointment} from './bookings'
type Invoice={id:string;booking_id:string|null;lab_order_id:string|null;user_id:string|null;pharmacy_order_id:string|null;total_paise:string;currency:string;state:string;clinic_id:string;doctor_user:string|null}
async function lockInvoiceBooking(tx:Db,id:string){const initial=await tx.one<{booking_id:string|null}>('SELECT i.booking_id FROM clinic.invoices i JOIN patient.bookings b ON b.id=i.booking_id WHERE i.id=$1 AND b.slot_id IS NOT NULL',[id]);return initial?.booking_id?lockPaymentAppointment(tx,initial.booking_id):null}
async function invoice(tx:Db,id:string){const row=await tx.one<Invoice>(`SELECT i.*,coalesce(d.clinic_id,p.clinic_id,partner.clinic_id,walk.clinic_id) clinic_id,coalesce(d.user_id,wd.user_id) doctor_user FROM clinic.invoices i
 LEFT JOIN patient.bookings b ON b.id=i.booking_id LEFT JOIN provider.doctors d ON d.id=b.doctor_id LEFT JOIN patient.lab_orders o ON o.id=i.lab_order_id LEFT JOIN clinic.lab_packages p ON p.id=o.package_id LEFT JOIN pharmacy.orders po ON po.id=i.pharmacy_order_id LEFT JOIN pharmacy.partners partner ON partner.id=po.partner_id LEFT JOIN clinic.walk_ins walk ON walk.id=i.walk_in_id LEFT JOIN provider.doctors wd ON wd.id=walk.doctor_id WHERE i.id=$1 FOR UPDATE OF i`,[id]);if(!row)reject('NOT_FOUND','Invoice unavailable.',404);return row}
async function cashier(tx:Db,actorId:string,i:Invoice){
 const user=await tx.one<{status:string;role:string;kyc_level:string}>('SELECT status,role,kyc_level FROM patient.users WHERE id=$1 FOR SHARE',[actorId]);if(user?.status!=='ACTIVE')reject('FORBIDDEN','Cashier access required.',403)
 if(!await tx.one("SELECT id FROM clinic.clinics WHERE id=$1 AND status='ACTIVE' FOR SHARE",[i.clinic_id]))reject('FORBIDDEN','This clinic is not active.',403)
 if(i.doctor_user===actorId&&user.role==='doctor'&&user.kyc_level==='verified'&&await tx.one("SELECT id FROM provider.doctors WHERE user_id=$1 AND status='ACTIVE' AND (verified_at IS NOT NULL OR ($2::boolean AND is_demo))",[actorId,localMode()]))return
 if(i.pharmacy_order_id&&await tx.one(`SELECT m.user_id FROM pharmacy.memberships m JOIN pharmacy.partners p ON p.id=m.partner_id JOIN pharmacy.orders o ON o.partner_id=p.id WHERE o.id=$1 AND m.user_id=$2 AND m.status='ACTIVE' AND m.role='PHARMACIST' AND m.verified_at IS NOT NULL AND p.status='ACTIVE' AND p.verified_at IS NOT NULL AND p.expires_on>=(now() AT TIME ZONE 'Asia/Kolkata')::date`,[i.pharmacy_order_id,actorId]))return
 if(!await tx.one("SELECT user_id FROM clinic.memberships WHERE clinic_id=$1 AND user_id=$2 AND role IN ('administrator','receptionist','lab') AND status='ACTIVE'",[i.clinic_id,actorId]))reject('FORBIDDEN','Cashier access required.',403)
}
async function postMoney(tx:Db,i:Invoice,effect:string,amount:string,source:string,unapplied=false){
 const claimed=await tx.one('INSERT INTO financial_effects(effect_key,invoice_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING effect_key',[effect,i.id]);if(!claimed)return false
 const debit='clearing:'+source+':'+i.clinic_id,credit=(unapplied?'refund-liability:':'revenue:')+i.clinic_id
 for(const[id,type]of [[debit,'CLEARING'],[credit,unapplied?'REFUND_LIABILITY':'CLINIC_REVENUE']])await tx.query('INSERT INTO ledger_accounts(account_id,account_type,owner_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,type,i.clinic_id])
 const exact=paise(amount).toString(),decimal=decimalRupees(exact)
 await tx.query('INSERT INTO ledger_entries(entry_id,transaction_id,account_id,direction,amount,amount_paise) VALUES($1,$2,$3,\'DEBIT\',$4,$5),($6,$2,$7,\'CREDIT\',$4,$5)',
  ['entry_'+randomUUID(),effect,debit,decimal,exact,'entry_'+randomUUID(),credit])
 await tx.query('UPDATE ledger_accounts SET balance_paise=balance_paise-$2::bigint WHERE account_id=$1',[debit,exact])
 await tx.query('UPDATE ledger_accounts SET balance_paise=balance_paise+$2::bigint WHERE account_id=$1',[credit,exact])
 return true
}
export async function recordClinicPayment(actorId:string,invoiceId:string,method:string,amount:string){
 if(!['cash','upi','card','free'].includes(method))reject('METHOD','Choose a recorded payment method.',400)
 const exact=paise(amount).toString();if(method==='free'&&paise(exact)!==0n)reject('AMOUNT','The no-fee method only applies to a zero-fee invoice.',400);await ensureSchema()
 return getDb().transaction(async tx=>{const booking=await lockInvoiceBooking(tx,invoiceId);const i=await invoice(tx,invoiceId);await cashier(tx,actorId,i);if(booking?.b.payment_required&&booking.b.status==='requested')reject('PAYMENT_REQUIRED','Use Cashfree checkout to confirm this appointment.');if(paise(i.total_paise)!==paise(exact))reject('AMOUNT','The recorded payment must match the invoice amount.',400);if(['PAID','WAIVED'].includes(i.state))return
 if(i.state!=='UNPAID')reject('STATE','This invoice cannot collect payment.')
 if(i.pharmacy_order_id&&!await tx.one("SELECT id FROM pharmacy.orders WHERE id=$1 AND state IN ('APPROVED','PACKED')",[i.pharmacy_order_id]))reject('STATE','The pharmacy must approve this request before collecting payment.')
 if(paise(exact)>0n)await postMoney(tx,i,'offline:'+i.id,exact,method)
 await tx.query('UPDATE clinic.invoices SET state=$2 WHERE id=$1',[i.id,paise(exact)===0n?'WAIVED':'PAID'])
 await tx.query("INSERT INTO audit_log(actor_id,action,resource,detail) VALUES($1,'payment:record',$2,$3::jsonb)",[actorId,i.id,JSON.stringify({method,amountPaise:exact})])
 await tx.query("INSERT INTO domain_events(kind,subject_id,payload,event_key) VALUES('payment.recorded',$1,$2::jsonb,$3) ON CONFLICT DO NOTHING",[i.id,JSON.stringify({userId:i.user_id}),'invoice:'+i.id+':paid'])
 })
}
export const onlinePaymentsConfigured=cashfreeConfigured
export async function createPaymentOrder(actorId:string,invoiceId:string,key:string){
 boundedText(key,128,16);if(!onlinePaymentsConfigured())reject('NOT_CONFIGURED','Online payment collection is not configured.',503)
 await ensureSchema();const order=await getDb().transaction(async tx=>{
  if(!await tx.one("SELECT id FROM patient.users WHERE id=$1 AND status='ACTIVE' FOR SHARE",[actorId]))reject('FORBIDDEN','Sign in again.',403)
  const booking=await lockInvoiceBooking(tx,invoiceId)
  const i=await invoice(tx,invoiceId);if(i.user_id!==actorId)reject('NOT_FOUND','Invoice unavailable.',404)
  if(i.state!=='UNPAID'||paise(i.total_paise)===0n)reject('STATE','No online payment is due for this invoice.')
  if(paise(i.total_paise)<100n)reject('AMOUNT','Cashfree requires at least ₹1.',400)
  if(booking){
    const live=await tx.one<{valid:boolean}>('SELECT $1::timestamptz>clock_timestamp() AND $2::timestamptz>clock_timestamp() AS valid',[booking.slot.locked_until,booking.slot.slot_start])
    if(booking.b.payment_required){if(booking.b.status!=='requested'||booking.slot.status!=='HELD'||booking.slot.reserved_booking_id!==booking.b.id||!live?.valid)reject('HOLD_EXPIRED','The payment hold expired or changed. Choose another time.')}
    else if(booking.b.status!=='confirmed')reject('STATE','The clinic must confirm the appointment before payment.')
  }
  if(i.pharmacy_order_id&&!await tx.one("SELECT id FROM pharmacy.orders WHERE id=$1 AND state IN ('APPROVED','PACKED')",[i.pharmacy_order_id]))reject('STATE','The pharmacy must approve this request before online payment.')
  const prior=await tx.one<{id:string;invoice_id:string;external_id:string|null;state:string;amount_paise:string;currency:string;gateway:string;payment_session_id:string|null;provider_request_key:string}>("SELECT * FROM payment_orders WHERE user_id=$1 AND (idempotency_key=$2 OR (invoice_id=$3 AND gateway='cashfree' AND state IN ('CREATING','CREATED','UNKNOWN'))) ORDER BY CASE WHEN idempotency_key=$2 THEN 0 ELSE 1 END,created_at LIMIT 1",[actorId,key,i.id])
  if(prior){if(prior.invoice_id!==i.id)reject('IDEMPOTENCY','The request key identifies another invoice.');if(prior.gateway!=='cashfree')reject('LEGACY_PAYMENT','This request belongs to a retired gateway. Use a new Cashfree request.',409);return {...prior,fresh:false}}
  const id='pay_'+randomUUID()
  const row=await tx.one<{provider_request_key:string}>("INSERT INTO payment_orders(id,invoice_id,user_id,amount_paise,currency,gateway,idempotency_key,state) VALUES($1,$2,$3,$4,$5,'cashfree',$6,'CREATING') RETURNING provider_request_key",[id,i.id,actorId,i.total_paise,i.currency,key])
  return {id,invoice_id:i.id,external_id:null,state:'CREATING',amount_paise:i.total_paise,currency:i.currency,payment_session_id:null as string|null,provider_request_key:row!.provider_request_key,fresh:true}
 })
 if(!order.external_id||!order.payment_session_id){
  try{const external=await cashfreeOrder(order.id,actorId,String(order.amount_paise),order.currency,order.provider_request_key,!order.fresh)
   await getDb().query("UPDATE payment_orders SET external_id=$2,payment_session_id=$3,state=CASE WHEN state IN ('CREATING','UNKNOWN') THEN 'CREATED' ELSE state END WHERE id=$1",[order.id,external.externalOrderId,external.paymentSessionId]);order.external_id=external.externalOrderId;order.payment_session_id=external.paymentSessionId
  }catch(error){await getDb().query("UPDATE payment_orders SET state='UNKNOWN' WHERE id=$1 AND state='CREATING'",[order.id]);throw error}
 }
 return {paymentId:order.id,externalOrderId:order.external_id,paymentSessionId:order.payment_session_id,mode:'sandbox',amountPaise:String(order.amount_paise),currency:order.currency}
}
export async function settleCapturedPayment(eventId:string,externalOrder:string,externalPayment:string,amount:string,currency:string,provider='cashfree'){
 await ensureSchema();return getDb().transaction(async tx=>{
  const initial=await tx.one<{invoice_id:string}>('SELECT invoice_id FROM payment_orders WHERE external_id=$1 AND gateway=$2',[externalOrder,provider])
  const booking=initial?await lockInvoiceBooking(tx,initial.invoice_id):null
  const p=await tx.one<{id:string;invoice_id:string;amount_paise:string;currency:string;state:string;gateway:string}>('SELECT * FROM payment_orders WHERE external_id=$1 AND gateway=$2 FOR UPDATE',[externalOrder,provider]);if(!p)reject('NOT_FOUND','Unknown payment order.',404)
  if(p.currency!==currency||paise(p.amount_paise)!==paise(amount))reject('AMOUNT','Payment amount or currency mismatch.',400)
  const receipt=await tx.one('INSERT INTO payment_inbox(gateway,event_id,payload) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING RETURNING event_id',[provider,eventId,JSON.stringify({order:externalOrder,payment:externalPayment,amountPaise:amount,currency})]);if(!receipt)return
  if(p.state==='CAPTURED'||p.state==='OVERPAYMENT'){await tx.query('UPDATE payment_inbox SET processed_at=now() WHERE gateway=$1 AND event_id=$2',[provider,eventId]);return}
  const i=await invoice(tx,p.invoice_id)
  if(i.state==='UNPAID'&&booking?.b.payment_required&&!await confirmPaidAppointment(tx,booking.b)){
    await tx.query("UPDATE clinic.invoices SET state='VOID' WHERE id=$1",[i.id]);i.state='VOID'
    // Retire only our own hold. Never change another patient's reservation.
    if(booking.b.status==='requested'){
      await tx.query("UPDATE patient.bookings SET status='expired',revision=revision+1 WHERE id=$1",[booking.b.id])
      await tx.query("INSERT INTO appointment_history(booking_id,from_status,to_status,revision,reason) SELECT id,'requested','expired',revision,'Paid after hold changed; refund review' FROM patient.bookings WHERE id=$1",[booking.b.id])
      await tx.query("INSERT INTO domain_events(kind,subject_id,payload,event_key) SELECT 'booking.expired',id,jsonb_build_object('userId',user_id,'revision',revision),'booking:'||id||':'||revision||':expired' FROM patient.bookings WHERE id=$1 ON CONFLICT DO NOTHING",[booking.b.id])
      await tx.query("UPDATE provider.appointment_slots SET status='AVAILABLE',reserved_booking_id=NULL,locked_by=NULL,locked_until=NULL,version=version+1 WHERE slot_id=$1 AND status='HELD' AND reserved_booking_id=$2",[booking.slot.slot_id,booking.b.id])
    }
  }
  const duplicate=['PAID','WAIVED','VOID','REFUNDED'].includes(i.state)
  await postMoney(tx,i,'gateway:'+p.id,amount,provider,duplicate)
  await tx.query('UPDATE payment_orders SET state=$2,external_payment_id=$3 WHERE id=$1',[p.id,duplicate?'OVERPAYMENT':'CAPTURED',externalPayment])
  if(!duplicate)await tx.query("UPDATE clinic.invoices SET state='PAID' WHERE id=$1",[i.id])
  else await tx.query("INSERT INTO refunds(id,payment_id,amount_paise,reason,requested_by) VALUES($1,$2,$3,$4,'system')",['refund_'+randomUUID(),p.id,amount,i.state==='VOID'?'Cancelled invoice; review late capture':'Invoice already settled; reconcile excess capture'])
  await tx.query("INSERT INTO audit_log(action,resource,detail) VALUES('payment:capture',$1,$2::jsonb)",[p.id,JSON.stringify({externalPayment,overpayment:duplicate})])
  if(i.user_id)await tx.query("INSERT INTO domain_events(kind,subject_id,payload,event_key) VALUES('payment.recorded',$1,$2::jsonb,$3) ON CONFLICT DO NOTHING",[i.id,JSON.stringify({userId:i.user_id}),'payment:'+p.id+':captured'])
  await tx.query('UPDATE payment_inbox SET processed_at=now() WHERE gateway=$1 AND event_id=$2',[provider,eventId])
 })
}
export async function verifyCheckout(actorId:string,externalOrder:string){
 await ensureSchema();const p=await getDb().one<{id:string;amount_paise:string;currency:string}>("SELECT p.id,p.amount_paise,p.currency FROM payment_orders p JOIN patient.users u ON u.id=p.user_id AND u.status='ACTIVE' WHERE p.external_id=$1 AND p.user_id=$2 AND p.gateway='cashfree'",[externalOrder,actorId]);if(!p)reject('NOT_FOUND','Payment order unavailable.',404)
 const captured=await cashfreePayment(externalOrder,String(p.amount_paise),p.currency)
 if(!captured)return {state:'AWAITING_CAPTURE'}
 await settleCapturedPayment('payment:'+captured.paymentId,externalOrder,captured.paymentId,captured.amountPaise,captured.currency)
 const result=await getDb().one<{state:string;booking_id:string|null;booking_status:string|null}>('SELECT p.state,i.booking_id,b.status booking_status FROM payment_orders p JOIN clinic.invoices i ON i.id=p.invoice_id LEFT JOIN patient.bookings b ON b.id=i.booking_id WHERE p.id=$1',[p.id])
 return {state:result!.state,bookingId:result!.booking_id,bookingStatus:result!.booking_status}
}
// Browser verification and signed webhooks are complemented by server recovery.
// This also catches a patient closing the browser immediately after payment.
export async function reconcileAppointmentPayment(){
 if(!cashfreeConfigured())return 0
 await ensureSchema()
 const row=await getDb().transaction(async tx=>{
  const p=await tx.one<{id:string;external_id:string;user_id:string}>(`SELECT p.id,p.external_id,p.user_id FROM payment_orders p
    JOIN clinic.invoices i ON i.id=p.invoice_id JOIN patient.bookings b ON b.id=i.booking_id
    WHERE b.payment_required AND p.gateway='cashfree' AND p.state IN ('CREATED','UNKNOWN') AND p.external_id IS NOT NULL
    AND p.next_reconcile_at<=now() AND p.created_at>now()-interval '2 days' ORDER BY p.next_reconcile_at LIMIT 1 FOR UPDATE OF p SKIP LOCKED`)
  if(p)await tx.query("UPDATE payment_orders SET next_reconcile_at=now()+interval '1 minute' WHERE id=$1",[p.id]);return p
 })
 if(!row)return 0
 try{const p=await getDb().one<{amount_paise:string;currency:string}>('SELECT amount_paise,currency FROM payment_orders WHERE id=$1',[row.id]);const evidence=await cashfreePayment(row.external_id,String(p!.amount_paise),p!.currency);if(evidence)await settleCapturedPayment('payment:'+evidence.paymentId,row.external_id,evidence.paymentId,evidence.amountPaise,evidence.currency)}
 catch{await getDb().query("INSERT INTO audit_log(action,resource) VALUES('payment:reconcile_retry',$1)",[row.id])}
 return 1
}
export async function ownInvoices(actorId:string){await ensureSchema();return getDb().query<{id:string;state:string;total_paise:string;currency:string;created_at:string}>('SELECT id,state,total_paise,currency,created_at FROM clinic.invoices WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200',[actorId])}
export async function ownPayments(actorId:string){await ensureSchema();return getDb().query<{id:string;invoice_id:string;state:string;amount_paise:string;remaining_paise:string;gateway:string;external_id:string|null}>(`SELECT p.id,p.invoice_id,p.state,p.amount_paise,p.gateway,p.external_id,p.amount_paise-coalesce((SELECT sum(r.amount_paise) FROM refunds r WHERE r.payment_id=p.id AND r.state IN ('REQUESTED','APPROVED','SUBMITTING','UNKNOWN','PROCESSED')),0) remaining_paise FROM payment_orders p WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 200`,[actorId])}
export async function requestRefund(actorId:string,paymentId:string,amount:string,reason:string){
 const exact=paise(amount);if(exact<=0n)reject('AMOUNT','Enter a positive refund amount.',400);boundedText(reason,500,10);await ensureSchema()
 return getDb().transaction(async tx=>{
  const initial=await tx.one<{invoice_id:string}>('SELECT invoice_id FROM payment_orders WHERE id=$1 AND user_id=$2',[paymentId,actorId]);if(!initial)reject('NOT_FOUND','Payment unavailable.',404)
  const booking=await lockInvoiceBooking(tx,initial.invoice_id);await invoice(tx,initial.invoice_id)
  if(booking?.b.payment_required&&booking.b.status==='confirmed')reject('CANCEL_FIRST','Cancel the appointment before requesting a refund.')
  if(await tx.one("SELECT id FROM doctor_payouts WHERE payment_id=$1 AND submitted_at IS NOT NULL AND state NOT IN ('FAILED','REVERSED')",[paymentId]))reject('PAYOUT_IN_PROGRESS','Doctor payout has already started. Contact support for a reconciled refund.')
  const p=await tx.one<{id:string;user_id:string;state:string;amount_paise:string}>('SELECT * FROM payment_orders WHERE id=$1 FOR UPDATE',[paymentId]);if(!p||p.user_id!==actorId)reject('NOT_FOUND','Payment unavailable.',404);if(!['CAPTURED','OVERPAYMENT'].includes(p.state))reject('STATE','Only a captured payment can be refunded.');const used=await tx.one<{amount:string}>("SELECT coalesce(sum(amount_paise),0) amount FROM refunds WHERE payment_id=$1 AND state IN ('REQUESTED','APPROVED','SUBMITTING','UNKNOWN','PROCESSED')",[p.id]);if(paise(used?.amount??'0')+exact>paise(p.amount_paise))reject('AMOUNT','The request exceeds the remaining refundable amount.',400);const id='rf_'+randomUUID();await tx.query('INSERT INTO refunds(id,payment_id,amount_paise,reason,requested_by) VALUES($1,$2,$3,$4,$5)',[id,p.id,exact.toString(),reason,actorId]);await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'refund:request',$2)",[actorId,id]);return id})
}
export async function processRefund(adminId:string,id:string){
 if(!onlinePaymentsConfigured())reject('NOT_CONFIGURED','Cashfree sandbox is not configured.',503)
 await ensureSchema();const r=await getDb().transaction(async tx=>{
  if(!await tx.one('SELECT id FROM admins WHERE id=$1 AND totp_secret IS NOT NULL',[adminId]))reject('FORBIDDEN','Administrator required.',403)
  const row=await tx.one<{id:string;state:string;amount_paise:string;external_payment_id:string;invoice_id:string;external_order:string;gateway:string}>(`SELECT r.*,p.external_payment_id,p.invoice_id,p.external_id external_order,p.gateway FROM refunds r JOIN payment_orders p ON p.id=r.payment_id WHERE r.id=$1 FOR UPDATE OF r`,[id])
  if(!row||row.state!=='REQUESTED'||!row.external_payment_id)reject('STATE','This refund is not ready for a new provider submission.')
  if(row.gateway!=='cashfree')reject('LEGACY_PAYMENT','Review this historical payment with its original provider.',409)
  await tx.query("UPDATE refunds SET state='SUBMITTING' WHERE id=$1",[id]);await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'refund:approve',$2)",[adminId,id]);return row
 })
 try{const response=await cashfreeRequest('orders/'+encodeURIComponent(r.external_order)+'/refunds','POST',{refund_amount:Number(decimalRupees(r.amount_paise)),refund_id:r.id,refund_note:'CareNest refund',refund_speed:'STANDARD'},r.id.slice(-36));if(response.refund_id!==r.id||response.order_id!==r.external_order||String(response.cf_payment_id)!==r.external_payment_id||cashfreeAmount(response.refund_amount)!==String(r.amount_paise)||response.refund_currency!=='INR')reject('REFUND_UNKNOWN','Unexpected Cashfree refund response.',503);await getDb().query("UPDATE refunds SET state='APPROVED',external_id=$2 WHERE id=$1 AND state IN ('SUBMITTING','UNKNOWN')",[r.id,response.refund_id]);if(response.refund_status==='SUCCESS')await settleRefund(String(response.refund_id))}
 catch(error){await getDb().query("UPDATE refunds SET state='UNKNOWN' WHERE id=$1 AND state='SUBMITTING'",[r.id]);throw error}
}
export async function settleRefund(externalId:string){
 await ensureSchema();await getDb().transaction(async tx=>{
  const r=await tx.one<{id:string;payment_id:string;amount_paise:string;state:string;invoice_id:string;payment_state:string;gateway:string}>(`SELECT r.*,p.invoice_id,p.state payment_state,p.gateway FROM refunds r JOIN payment_orders p ON p.id=r.payment_id WHERE r.external_id=$1 FOR UPDATE OF r`,[externalId])
  if(!r)reject('NOT_FOUND','Refund reference unavailable.',404)
  const i=await invoice(tx,r.invoice_id),effect='refund:'+r.id,claimed=await tx.one('INSERT INTO financial_effects(effect_key,invoice_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING effect_key',[effect,i.id]);if(!claimed)return
  const debit=(r.payment_state==='OVERPAYMENT'?'refund-liability:':'revenue:')+i.clinic_id,credit='clearing:'+r.gateway+':'+i.clinic_id,decimal=decimalRupees(r.amount_paise)
  await tx.query("INSERT INTO ledger_entries(entry_id,transaction_id,account_id,direction,amount,amount_paise) VALUES($1,$2,$3,'DEBIT',$4,$5),($6,$2,$7,'CREDIT',$4,$5)",['entry_'+randomUUID(),effect,debit,decimal,r.amount_paise,'entry_'+randomUUID(),credit])
  await tx.query('UPDATE ledger_accounts SET balance_paise=balance_paise-$2::bigint WHERE account_id=$1',[debit,r.amount_paise]);await tx.query('UPDATE ledger_accounts SET balance_paise=balance_paise+$2::bigint WHERE account_id=$1',[credit,r.amount_paise])
  await tx.query("UPDATE refunds SET state='PROCESSED' WHERE id=$1",[r.id])
  const total=await tx.one<{amount:string}>("SELECT coalesce(sum(amount_paise),0) amount FROM refunds WHERE payment_id=$1 AND state='PROCESSED'",[r.payment_id])
  if(r.payment_state==='CAPTURED'&&paise(total?.amount??'0')>=paise(i.total_paise))await tx.query("UPDATE clinic.invoices SET state='REFUNDED' WHERE id=$1",[i.id])
  await tx.query("INSERT INTO audit_log(action,resource) VALUES('refund:processed',$1)",[r.id])
  if(i.user_id)await tx.query("INSERT INTO domain_events(kind,subject_id,payload,event_key) VALUES('payment.refunded',$1,$2::jsonb,$3) ON CONFLICT DO NOTHING",[i.id,JSON.stringify({userId:i.user_id}),'refund:'+r.id+':processed'])
 })
}
