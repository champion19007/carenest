import 'server-only'
import {randomUUID} from 'node:crypto'
import {ensureSchema,getDb} from '@/lib/db/client'
import {cashfreeTestConfigured,cashfreeOrder,cashfreePayment} from '@/lib/cashfree'
import {reject,boundedText} from './errors'

function enabled(){if(!cashfreeTestConfigured())reject('DEMO_DISABLED','This demo requires local mode and Cashfree sandbox credentials.',403)}
export async function createDemoPayment(actorId:string,key:string){
 enabled();boundedText(key,128,16);await ensureSchema()
 const order=await getDb().transaction(async tx=>{
  if(!await tx.one("SELECT id FROM patient.users WHERE id=$1 AND status='ACTIVE' FOR UPDATE",[actorId]))reject('FORBIDDEN','Sign in again.',403)
  const previous=await tx.one<{id:string;external_id:string|null;state:string;gateway:string;payment_session_id:string|null;provider_request_key:string}>('SELECT * FROM demo_payment_orders WHERE user_id=$1 AND idempotency_key=$2',[actorId,key]);if(previous){if(previous.gateway!=='cashfree')reject('LEGACY_PAYMENT','Start a new Cashfree sandbox test; this request belongs to a retired gateway.',409);return {...previous,fresh:false}}
  const id='dpy_'+randomUUID();const row=await tx.one<{provider_request_key:string}>("INSERT INTO demo_payment_orders(id,user_id,idempotency_key,amount_paise,gateway) VALUES($1,$2,$3,10000,'cashfree') RETURNING provider_request_key",[id,actorId,key]);return {id,external_id:null,state:'CREATING',payment_session_id:null as string|null,provider_request_key:row!.provider_request_key,fresh:true}
 })
 if(order.state==='CAPTURED')reject('STATE','This test order is already paid.')
 if(!order.external_id||!order.payment_session_id){
  try{const response=await cashfreeOrder(order.id,actorId,'10000','INR',order.provider_request_key,!order.fresh)
   await getDb().query("UPDATE demo_payment_orders SET external_id=$2,payment_session_id=$3,state=CASE WHEN state IN ('CREATING','UNKNOWN') THEN 'CREATED' ELSE state END WHERE id=$1",[order.id,response.externalOrderId,response.paymentSessionId]);order.external_id=response.externalOrderId;order.payment_session_id=response.paymentSessionId
  }catch(error){await getDb().query("UPDATE demo_payment_orders SET state='UNKNOWN' WHERE id=$1 AND state='CREATING'",[order.id]);throw error}
 }
 return {paymentId:order.id,externalOrderId:order.external_id,paymentSessionId:order.payment_session_id,mode:'sandbox',amountPaise:'10000',currency:'INR',demo:true}
}
export async function settleDemoPayment(externalOrder:string,externalPayment:string,amount:string,currency:string){
 enabled();await ensureSchema();return getDb().transaction(async tx=>{
  const row=await tx.one<{id:string;user_id:string;amount_paise:string;currency:string;state:string;external_payment_id:string|null}>("SELECT * FROM demo_payment_orders WHERE external_id=$1 AND gateway='cashfree' FOR UPDATE",[externalOrder]);if(!row)return false
  if(String(row.amount_paise)!==amount||row.currency!==currency)reject('AMOUNT','Test payment amount or currency mismatch.',400)
  if(row.state==='CAPTURED'){if(row.external_payment_id!==externalPayment)reject('PAYMENT_CONFLICT','Another payment is already recorded.',409);return true}
  await tx.query("UPDATE demo_payment_orders SET state='CAPTURED',external_payment_id=$2,paid_at=now() WHERE id=$1",[row.id,externalPayment])
  await tx.query("INSERT INTO domain_events(kind,subject_id,payload,event_key) VALUES('demo.payment_completed',$1,$2::jsonb,$3) ON CONFLICT DO NOTHING",[row.id,JSON.stringify({userId:row.user_id,provider:'Cashfree'}),'demo-payment:'+row.id+':captured'])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'demo:payment-captured',$2)",[row.user_id,row.id]);return true
 })
}
export async function verifyDemoPayment(actorId:string,orderId:string){
 enabled();await ensureSchema()
 if(!await getDb().one("SELECT p.id FROM demo_payment_orders p JOIN patient.users u ON u.id=p.user_id AND u.status='ACTIVE' WHERE p.external_id=$1 AND p.user_id=$2 AND p.gateway='cashfree'",[orderId,actorId]))reject('NOT_FOUND','Test order unavailable.',404)
 const payment=await cashfreePayment(orderId,'10000','INR')
 if(!payment)return {state:'AWAITING_CAPTURE'}
 await settleDemoPayment(orderId,payment.paymentId,payment.amountPaise,payment.currency);return {state:'CAPTURED'}
}
export async function ownDemoPayments(actorId:string){await ensureSchema();return getDb().query<{id:string;state:string;amount_paise:string;external_payment_id:string|null;created_at:string;gateway:string;external_id:string|null}>('SELECT id,state,amount_paise,external_payment_id,created_at,gateway,external_id FROM demo_payment_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20',[actorId])}
