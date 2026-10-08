import 'server-only'
import {randomUUID,createHmac,timingSafeEqual} from 'node:crypto'
import {getDb,ensureSchema,type Db} from '@/lib/db/client'
import {localMode} from '@/lib/secrets'
import {paise,decimalRupees} from '@/lib/money'
import {boundedText,reject,DomainError} from './errors'
type Invoice={id:string;booking_id:string|null;lab_order_id:string|null;user_id:string|null;pharmacy_order_id:string|null;total_paise:string;currency:string;state:string;clinic_id:string;doctor_user:string|null}
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
 return getDb().transaction(async tx=>{const i=await invoice(tx,invoiceId);await cashier(tx,actorId,i);if(paise(i.total_paise)!==paise(exact))reject('AMOUNT','The recorded payment must match the invoice amount.',400);if(['PAID','WAIVED'].includes(i.state))return
 if(i.state!=='UNPAID')reject('STATE','This invoice cannot collect payment.')
 if(i.pharmacy_order_id&&!await tx.one("SELECT id FROM pharmacy.orders WHERE id=$1 AND state IN ('APPROVED','PACKED')",[i.pharmacy_order_id]))reject('STATE','The pharmacy must approve this request before collecting payment.')
 if(paise(exact)>0n)await postMoney(tx,i,'offline:'+i.id,exact,method)
 await tx.query('UPDATE clinic.invoices SET state=$2 WHERE id=$1',[i.id,paise(exact)===0n?'WAIVED':'PAID'])
 await tx.query("INSERT INTO audit_log(actor_id,action,resource,detail) VALUES($1,'payment:record',$2,$3::jsonb)",[actorId,i.id,JSON.stringify({method,amountPaise:exact})])
 await tx.query("INSERT INTO domain_events(kind,subject_id,payload,event_key) VALUES('payment.recorded',$1,$2::jsonb,$3) ON CONFLICT DO NOTHING",[i.id,JSON.stringify({userId:i.user_id}),'invoice:'+i.id+':paid'])
 })
}
export function onlinePaymentsConfigured(){return process.env.ENABLE_PAYMENTS==='1'&&Boolean(process.env.RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET)&&(!localMode()||process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test_'))}
async function gateway(path:string,method='GET',body?:unknown){if(!onlinePaymentsConfigured())reject('NOT_CONFIGURED','Online payment collection is not configured.',503);let response:Response;try{response=await fetch('https://api.razorpay.com/v1/'+path,{method,headers:{Authorization:'Basic '+Buffer.from(process.env.RAZORPAY_KEY_ID+':'+process.env.RAZORPAY_KEY_SECRET).toString('base64'),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)})}catch{throw new DomainError('PAYMENT_UNKNOWN','The payment-provider outcome requires reconciliation.',503)}if(!response.ok)reject('PAYMENT_PROVIDER','The payment provider rejected this operation.',502);return await response.json() as Record<string,unknown>}
export async function createPaymentOrder(actorId:string,invoiceId:string,key:string){
 boundedText(key,128,16);if(!onlinePaymentsConfigured())reject('NOT_CONFIGURED','Online payment collection is not configured.',503)
 await ensureSchema();const order=await getDb().transaction(async tx=>{
  const i=await invoice(tx,invoiceId);if(i.user_id!==actorId)reject('NOT_FOUND','Invoice unavailable.',404)
  if(i.state!=='UNPAID'||paise(i.total_paise)===0n)reject('STATE','No online payment is due for this invoice.')
  if(i.booking_id&&!await tx.one("SELECT id FROM patient.bookings WHERE id=$1 AND status='confirmed'",[i.booking_id]))reject('STATE','The clinic must confirm the appointment before payment.')
  if(i.pharmacy_order_id&&!await tx.one("SELECT id FROM pharmacy.orders WHERE id=$1 AND state IN ('APPROVED','PACKED')",[i.pharmacy_order_id]))reject('STATE','The pharmacy must approve this request before online payment.')
  const prior=await tx.one<{id:string;invoice_id:string;external_id:string|null;state:string;amount_paise:string;currency:string}>('SELECT * FROM payment_orders WHERE user_id=$1 AND idempotency_key=$2',[actorId,key])
  if(prior){if(prior.invoice_id!==i.id)reject('IDEMPOTENCY','The request key identifies another invoice.');return {...prior,fresh:false}}
  const id='pay_'+randomUUID()
  await tx.query("INSERT INTO payment_orders(id,invoice_id,user_id,amount_paise,currency,gateway,idempotency_key,state) VALUES($1,$2,$3,$4,$5,'razorpay',$6,'CREATING')",[id,i.id,actorId,i.total_paise,i.currency,key])
  return {id,invoice_id:i.id,external_id:null,state:'CREATING',amount_paise:i.total_paise,currency:i.currency,fresh:true}
 })
 if(!order.external_id){
  if(!order.fresh)reject('PAYMENT_UNKNOWN','The previous payment order needs reconciliation before another is created.',503)
  try{const amount=Number(order.amount_paise);if(!Number.isSafeInteger(amount)||amount>1000000000)reject('AMOUNT','The invoice is outside the configured online collection limit.',400)
   const external=await gateway('orders','POST',{amount,currency:order.currency,receipt:order.id})
   if(typeof external.id!=='string'||String(external.currency)!==order.currency||String(external.amount)!==String(order.amount_paise))reject('PAYMENT_RESPONSE','Unexpected payment order response.',502)
   await getDb().query("UPDATE payment_orders SET external_id=$2,state='CREATED' WHERE id=$1 AND state='CREATING'",[order.id,external.id]);order.external_id=external.id
  }catch(error){await getDb().query("UPDATE payment_orders SET state='UNKNOWN' WHERE id=$1",[order.id]);throw error}
 }
 return {paymentId:order.id,externalOrderId:order.external_id,keyId:process.env.RAZORPAY_KEY_ID,amountPaise:order.amount_paise,currency:order.currency}
}
export async function settleCapturedPayment(eventId:string,externalOrder:string,externalPayment:string,amount:string,currency:string){
 await ensureSchema();return getDb().transaction(async tx=>{
  const p=await tx.one<{id:string;invoice_id:string;amount_paise:string;currency:string;state:string}>('SELECT * FROM payment_orders WHERE external_id=$1 FOR UPDATE',[externalOrder]);if(!p)reject('NOT_FOUND','Unknown payment order.',404)
  if(p.currency!==currency||paise(p.amount_paise)!==paise(amount))reject('AMOUNT','Payment amount or currency mismatch.',400)
  const receipt=await tx.one('INSERT INTO payment_inbox(gateway,event_id,payload) VALUES(\'razorpay\',$1,$2::jsonb) ON CONFLICT DO NOTHING RETURNING event_id',[eventId,JSON.stringify({order:externalOrder,payment:externalPayment,amountPaise:amount,currency})]);if(!receipt)return
  if(p.state==='CAPTURED'||p.state==='OVERPAYMENT'){await tx.query("UPDATE payment_inbox SET processed_at=now() WHERE gateway='razorpay' AND event_id=$1",[eventId]);return}
  const i=await invoice(tx,p.invoice_id),duplicate=['PAID','WAIVED','VOID','REFUNDED'].includes(i.state)
  await postMoney(tx,i,'gateway:'+p.id,amount,'razorpay',duplicate)
  await tx.query('UPDATE payment_orders SET state=$2,external_payment_id=$3 WHERE id=$1',[p.id,duplicate?'OVERPAYMENT':'CAPTURED',externalPayment])
  if(!duplicate)await tx.query("UPDATE clinic.invoices SET state='PAID' WHERE id=$1",[i.id])
  else await tx.query("INSERT INTO refunds(id,payment_id,amount_paise,reason,requested_by) VALUES($1,$2,$3,$4,'system')",['refund_'+randomUUID(),p.id,amount,i.state==='VOID'?'Cancelled invoice; review late capture':'Invoice already settled; reconcile excess capture'])
  await tx.query("INSERT INTO audit_log(action,resource,detail) VALUES('payment:capture',$1,$2::jsonb)",[p.id,JSON.stringify({externalPayment,overpayment:duplicate})])
  await tx.query('UPDATE payment_inbox SET processed_at=now() WHERE gateway=\'razorpay\' AND event_id=$1',[eventId])
 })
}
export async function verifyCheckout(actorId:string,externalOrder:string,externalPayment:string,signature:string){
 await ensureSchema();const p=await getDb().one<{id:string;amount_paise:string;currency:string}>('SELECT id,amount_paise,currency FROM payment_orders WHERE external_id=$1 AND user_id=$2',[externalOrder,actorId]);if(!p)reject('NOT_FOUND','Payment order unavailable.',404)
 const expected=createHmac('sha256',process.env.RAZORPAY_KEY_SECRET??'').update(externalOrder+'|'+externalPayment).digest('hex')
 if(!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(expected,'hex')))reject('SIGNATURE','Invalid payment signature.',400)
 const captured=await gateway('payments/'+encodeURIComponent(externalPayment))
 if(captured.order_id!==externalOrder||captured.currency!==p.currency||String(captured.amount)!==String(p.amount_paise))reject('AMOUNT','Provider payment details do not match.',400)
 if(captured.status!=='captured')return {state:'AWAITING_CAPTURE'}
 await settleCapturedPayment('checkout:'+externalPayment,externalOrder,externalPayment,String(captured.amount),String(captured.currency));return {state:'CAPTURED'}
}
export async function ownInvoices(actorId:string){await ensureSchema();return getDb().query<{id:string;state:string;total_paise:string;currency:string;created_at:string}>('SELECT id,state,total_paise,currency,created_at FROM clinic.invoices WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200',[actorId])}
export async function ownPayments(actorId:string){await ensureSchema();return getDb().query<{id:string;invoice_id:string;state:string;amount_paise:string;remaining_paise:string}>(`SELECT p.id,p.invoice_id,p.state,p.amount_paise,p.amount_paise-coalesce((SELECT sum(r.amount_paise) FROM refunds r WHERE r.payment_id=p.id AND r.state IN ('REQUESTED','APPROVED','SUBMITTING','UNKNOWN','PROCESSED')),0) remaining_paise FROM payment_orders p WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 200`,[actorId])}
export async function requestRefund(actorId:string,paymentId:string,amount:string,reason:string){
 const exact=paise(amount);if(exact<=0n)reject('AMOUNT','Enter a positive refund amount.',400);boundedText(reason,500,10);await ensureSchema()
 return getDb().transaction(async tx=>{const p=await tx.one<{id:string;user_id:string;state:string;amount_paise:string}>('SELECT * FROM payment_orders WHERE id=$1 FOR UPDATE',[paymentId]);if(!p||p.user_id!==actorId)reject('NOT_FOUND','Payment unavailable.',404);if(!['CAPTURED','OVERPAYMENT'].includes(p.state))reject('STATE','Only a captured payment can be refunded.');const used=await tx.one<{amount:string}>("SELECT coalesce(sum(amount_paise),0) amount FROM refunds WHERE payment_id=$1 AND state IN ('REQUESTED','APPROVED','SUBMITTING','UNKNOWN','PROCESSED')",[p.id]);if(paise(used?.amount??'0')+exact>paise(p.amount_paise))reject('AMOUNT','The request exceeds the remaining refundable amount.',400);const id='rf_'+randomUUID();await tx.query('INSERT INTO refunds(id,payment_id,amount_paise,reason,requested_by) VALUES($1,$2,$3,$4,$5)',[id,p.id,exact.toString(),reason,actorId]);await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'refund:request',$2)",[actorId,id]);return id})
}
export async function processRefund(adminId:string,id:string){
 await ensureSchema();const r=await getDb().transaction(async tx=>{
  if(!await tx.one('SELECT id FROM admins WHERE id=$1 AND totp_secret IS NOT NULL',[adminId]))reject('FORBIDDEN','Administrator required.',403)
  const row=await tx.one<{id:string;state:string;amount_paise:string;external_payment_id:string;invoice_id:string}>(`SELECT r.*,p.external_payment_id,p.invoice_id FROM refunds r JOIN payment_orders p ON p.id=r.payment_id WHERE r.id=$1 FOR UPDATE OF r`,[id])
  if(!row||row.state!=='REQUESTED'||!row.external_payment_id)reject('STATE','This refund is not ready for a new provider submission.')
  await tx.query("UPDATE refunds SET state='SUBMITTING' WHERE id=$1",[id]);await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'refund:approve',$2)",[adminId,id]);return row
 })
 try{const response=await gateway('payments/'+encodeURIComponent(r.external_payment_id)+'/refund','POST',{amount:Number(r.amount_paise),receipt:r.id});if(typeof response.id!=='string')reject('REFUND_UNKNOWN','Refund receipt missing.',503);await getDb().query("UPDATE refunds SET state='APPROVED',external_id=$2 WHERE id=$1",[r.id,response.id]);if(response.status==='processed')await settleRefund(String(response.id))}
 catch(error){await getDb().query("UPDATE refunds SET state='UNKNOWN' WHERE id=$1",[r.id]);throw error}
}
export async function settleRefund(externalId:string){
 await ensureSchema();await getDb().transaction(async tx=>{
  const r=await tx.one<{id:string;payment_id:string;amount_paise:string;state:string;invoice_id:string;payment_state:string}>(`SELECT r.*,p.invoice_id,p.state payment_state FROM refunds r JOIN payment_orders p ON p.id=r.payment_id WHERE r.external_id=$1 FOR UPDATE OF r`,[externalId])
  if(!r)reject('NOT_FOUND','Refund reference unavailable.',404)
  const i=await invoice(tx,r.invoice_id),effect='refund:'+r.id,claimed=await tx.one('INSERT INTO financial_effects(effect_key,invoice_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING effect_key',[effect,i.id]);if(!claimed)return
  const debit=(r.payment_state==='OVERPAYMENT'?'refund-liability:':'revenue:')+i.clinic_id,credit='clearing:razorpay:'+i.clinic_id,decimal=decimalRupees(r.amount_paise)
  await tx.query("INSERT INTO ledger_entries(entry_id,transaction_id,account_id,direction,amount,amount_paise) VALUES($1,$2,$3,'DEBIT',$4,$5),($6,$2,$7,'CREDIT',$4,$5)",['entry_'+randomUUID(),effect,debit,decimal,r.amount_paise,'entry_'+randomUUID(),credit])
  await tx.query('UPDATE ledger_accounts SET balance_paise=balance_paise-$2::bigint WHERE account_id=$1',[debit,r.amount_paise]);await tx.query('UPDATE ledger_accounts SET balance_paise=balance_paise+$2::bigint WHERE account_id=$1',[credit,r.amount_paise])
  await tx.query("UPDATE refunds SET state='PROCESSED' WHERE id=$1",[r.id])
  const total=await tx.one<{amount:string}>("SELECT coalesce(sum(amount_paise),0) amount FROM refunds WHERE payment_id=$1 AND state='PROCESSED'",[r.payment_id])
  if(r.payment_state==='CAPTURED'&&paise(total?.amount??'0')>=paise(i.total_paise))await tx.query("UPDATE clinic.invoices SET state='REFUNDED' WHERE id=$1",[i.id])
  await tx.query("INSERT INTO audit_log(action,resource) VALUES('refund:processed',$1)",[r.id])
 })
}
