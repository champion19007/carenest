import 'server-only'
import {createHash} from 'node:crypto'
import {ensureSchema,getDb} from '@/lib/db/client'
import {verifyCashfreeWebhook,cashfreePayment,cashfreeRequest,cashfreeAmount} from '@/lib/cashfree'
import {settleCapturedPayment,settleRefund} from './billing'
import {settleDemoPayment} from './demo-payments'
import {reject} from './errors'
import {paymentSuccessWebhook,refundStatusWebhook,unknownWebhook} from '@/lib/schemas'

export async function acceptCashfreeWebhook(raw:Uint8Array,timestamp:string,signature:string){
 verifyCashfreeWebhook(raw,timestamp,signature)
 let body;try{body=JSON.parse(new TextDecoder().decode(raw))}catch{reject('BODY','Invalid Cashfree webhook.',400)}
 await ensureSchema()
 if(body?.type==='PAYMENT_SUCCESS_WEBHOOK'){
  const parsed=paymentSuccessWebhook.safeParse(body);if(!parsed.success)reject('FIELDS','Invalid Cashfree payment event.',400)
  const event=parsed.data!,orderId=event.data.order.order_id,paymentId=event.data.payment.cf_payment_id
  const demo=await getDb().one<{amount_paise:string;currency:string}>("SELECT amount_paise,currency FROM demo_payment_orders WHERE external_id=$1 AND gateway='cashfree'",[orderId])
  const saved=demo??await getDb().one<{amount_paise:string;currency:string}>("SELECT amount_paise,currency FROM payment_orders WHERE external_id=$1 AND gateway='cashfree'",[orderId]);if(!saved)reject('NOT_FOUND','Unknown Cashfree order.',404)
  if(cashfreeAmount(event.data.order.order_amount)!==String(saved.amount_paise)||event.data.order.order_currency!==saved.currency||cashfreeAmount(event.data.payment.payment_amount)!==String(saved.amount_paise)||event.data.payment.payment_currency!==saved.currency)reject('AMOUNT','Cashfree webhook amount does not match.',400)
  const payment=await cashfreePayment(orderId,String(saved.amount_paise),saved.currency,paymentId)
  if(!payment)reject('PAYMENT_PENDING','Cashfree has not confirmed this successful payment yet.',503)
  if(demo)await settleDemoPayment(orderId,payment.paymentId,payment.amountPaise,payment.currency)
  else await settleCapturedPayment('payment:'+payment.paymentId,orderId,payment.paymentId,payment.amountPaise,payment.currency)
 }else if(body?.type==='REFUND_STATUS_WEBHOOK'){
  const parsed=refundStatusWebhook.safeParse(body)
  const id=parsed.success?(parsed.data.data.refund?.refund_id??parsed.data.data.refund_id):undefined
  if(!id)reject('FIELDS','Invalid Cashfree refund event.',400)
  const saved=await getDb().one<{id:string;amount_paise:string;external_id:string|null;external_order:string;external_payment_id:string;state:string}>("SELECT r.*,p.external_id external_order,p.external_payment_id FROM refunds r JOIN payment_orders p ON p.id=r.payment_id WHERE r.id=$1 AND p.gateway='cashfree'",[id]);if(!saved)reject('NOT_FOUND','Unknown Cashfree refund.',404)
  if(!['SUBMITTING','UNKNOWN','APPROVED','PROCESSED'].includes(saved.state))reject('STATE','This refund has not been submitted.',409)
  const refund=await cashfreeRequest('orders/'+encodeURIComponent(saved.external_order)+'/refunds/'+encodeURIComponent(id))
  if(refund.refund_id!==id||refund.order_id!==saved.external_order||String(refund.cf_payment_id)!==saved.external_payment_id||cashfreeAmount(refund.refund_amount)!==String(saved.amount_paise)||refund.refund_currency!=='INR')reject('AMOUNT','Cashfree refund does not match the saved request.',400)
  if(refund.refund_status==='SUCCESS'){
   await getDb().query('UPDATE refunds SET external_id=$2 WHERE id=$1 AND external_id IS NULL',[id,refund.refund_id]);await settleRefund(id)
  }
 }else{
  // Failed attempts must not reverse a payment already verified as successful.
  const eventId=createHash('sha256').update(raw).digest('hex')
  await getDb().query("INSERT INTO payment_inbox(gateway,event_id,payload,processed_at) VALUES('cashfree',$1,$2::jsonb,now()) ON CONFLICT DO NOTHING",[eventId,JSON.stringify({type:unknownWebhook.parse(body??{}).type})])
 }
}
