import 'server-only'
import {createHmac,createHash,timingSafeEqual} from 'node:crypto'
import {localMode} from './secrets'
import {decimalRupees,paise,rupeesToPaise} from './money'
import {DomainError,reject,boundedText} from './domain/errors'

// MVP deliberately has no production host or browser mode.
export function cashfreeConfigured(){return process.env.ENABLE_PAYMENTS==='1'&&process.env.CASHFREE_ENV==='sandbox'&&Boolean(process.env.CASHFREE_CLIENT_ID?.trim()&&process.env.CASHFREE_CLIENT_SECRET?.trim())}
export function cashfreeTestConfigured(){return localMode()&&cashfreeConfigured()}
export async function cashfreeRequest(path:string,method='GET',body?:unknown,idempotencyKey?:string):Promise<any>{
 if(!cashfreeConfigured())reject('NOT_CONFIGURED','Save Cashfree sandbox credentials and enable sandbox payments first.',503)
 let response:Response
 try{response=await fetch('https://sandbox.cashfree.com/pg/'+path,{method,cache:'no-store',headers:{'x-client-id':process.env.CASHFREE_CLIENT_ID!,'x-client-secret':process.env.CASHFREE_CLIENT_SECRET!,'x-api-version':'2025-01-01','Content-Type':'application/json',...(idempotencyKey?{'x-idempotency-key':idempotencyKey}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)})}
 catch{throw new DomainError('PAYMENT_UNKNOWN','Cashfree could not confirm the outcome. Check the same order before trying another payment.',503)}
 if(!response.ok)reject(response.status===404?'PROVIDER_NOT_FOUND':'PAYMENT_PROVIDER',response.status===401?'Cashfree rejected the sandbox credentials.':'Cashfree could not complete this operation.',response.status===401?401:response.status===404?404:502)
 try{return await response.json()}catch{reject('PAYMENT_RESPONSE','Cashfree returned an unreadable response.',502)}
}
export function cashfreeAmount(value:unknown){
 try{if(typeof value!=='number'&&typeof value!=='string')throw new Error();return rupeesToPaise(String(value))}catch{reject('AMOUNT','Unexpected Cashfree amount.',400)}
}
export async function cashfreeOrder(id:string,actorId:string,amount:string,currency:string,key:string,recover=false){
 const value=paise(amount);if(value<100n||value>1000000000n||currency!=='INR')reject('AMOUNT','Cashfree sandbox supports INR invoices from ₹1 to ₹1 crore.',400)
 let order:any
 if(recover){try{order=await cashfreeRequest('orders/'+encodeURIComponent(id))}catch(error){if(!(error instanceof DomainError)||error.code!=='PROVIDER_NOT_FOUND')throw error}}
 if(!order){
  const origin=new URL(process.env.APP_ORIGIN??'http://localhost:3000');if(!['http:','https:'].includes(origin.protocol)||origin.username||origin.password)reject('CONFIGURATION','Set a valid APP_ORIGIN.',503)
  const returnUrl=new URL('/account/billing',origin);returnUrl.searchParams.set('payment_order',id)
  order=await cashfreeRequest('orders','POST',{order_id:id,order_amount:Number(decimalRupees(amount)),order_currency:currency,customer_details:{customer_id:createHash('sha256').update(actorId).digest('hex').slice(0,32),customer_phone:'9999999999'},order_meta:{return_url:returnUrl.toString()}},key)
 }
 if(order?.order_id!==id||order.order_currency!==currency||cashfreeAmount(order.order_amount)!==amount||typeof order.payment_session_id!=='string'||!order.payment_session_id||order.payment_session_id.length>4096)reject('PAYMENT_RESPONSE','Unexpected Cashfree order response.',502)
 return {externalOrderId:id,paymentSessionId:order.payment_session_id as string}
}
export async function cashfreePayment(orderId:string,amount:string,currency:string,expectedPaymentId?:string){
 boundedText(orderId,128,1)
 const order=await cashfreeRequest('orders/'+encodeURIComponent(orderId))
 if(order?.order_id!==orderId||order.order_currency!==currency||cashfreeAmount(order.order_amount)!==amount)reject('AMOUNT','Cashfree order does not match the saved invoice.',400)
 const payments=await cashfreeRequest('orders/'+encodeURIComponent(orderId)+'/payments')
 if(!Array.isArray(payments))reject('PAYMENT_RESPONSE','Unexpected Cashfree payment response.',502)
 const paid=payments.find(p=>p?.payment_status==='SUCCESS'&&(!expectedPaymentId||String(p.cf_payment_id)===expectedPaymentId))
 if(!paid||order.order_status!=='PAID')return null
 if(paid.order_id!==orderId||paid.payment_currency!==currency||cashfreeAmount(paid.payment_amount)!==amount||!/^\d{1,40}$/.test(String(paid.cf_payment_id)))reject('AMOUNT','Cashfree payment does not match the saved invoice.',400)
 return {paymentId:String(paid.cf_payment_id),amountPaise:amount,currency}
}
export function verifyCashfreeWebhook(raw:Uint8Array,timestamp:string,signature:string){
 if(!cashfreeConfigured())reject('NOT_CONFIGURED','Cashfree sandbox is not configured.',503)
 // Do not reject delayed retries by wall-clock age. Idempotent money effects handle replay.
 if(!/^\d{10,16}$/.test(timestamp)||!/^[A-Za-z0-9+/]{43}=$/.test(signature))reject('SIGNATURE','Invalid Cashfree webhook signature.',401)
 const expected=createHmac('sha256',process.env.CASHFREE_CLIENT_SECRET!).update(timestamp).update(raw).digest(),supplied=Buffer.from(signature,'base64')
 if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))reject('SIGNATURE','Invalid Cashfree webhook signature.',401)
}
