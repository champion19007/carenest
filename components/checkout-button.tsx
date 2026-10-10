'use client'
import {useState} from 'react'
import {useRouter} from 'next/navigation'
type Checkout={checkout:(options:{paymentSessionId:string;redirectTarget:'_modal'})=>Promise<{error?:{message?:string};redirect?:boolean;paymentDetails?:unknown}>}
declare global {interface Window {Cashfree?:(options:{mode:'sandbox'})=>Checkout}}
let loading:Promise<void>|undefined
async function loadCheckout(){
 if(window.Cashfree)return
 loading??=new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src='https://sdk.cashfree.com/js/v3/cashfree.js';script.onload=()=>resolve();script.onerror=()=>{script.remove();loading=undefined;reject(new Error('Cashfree checkout could not load. Try again.'))};document.head.appendChild(script)})
 await loading;if(!window.Cashfree){loading=undefined;throw new Error('Cashfree checkout is unavailable.')}
}
async function verifyOrder(orderId:string,demo:boolean){
 const response=await fetch('/api/payments/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:orderId,demo})}),result=await response.json()
 if(!response.ok)throw new Error(result.error??'Payment verification failed.')
 return result
}
export function PaymentStatusButton({orderId,demo=false,bookingId}:{orderId:string;demo?:boolean;bookingId?:string}){
 const router=useRouter(),[pending,setPending]=useState(false),[message,setMessage]=useState('')
 return <div className="mt-3"><button type="button" className="min-h-11 text-sm font-semibold text-primary" disabled={pending} onClick={async()=>{setPending(true);try{const result=await verifyOrder(orderId,demo);setMessage(result.state==='OVERPAYMENT'?'Payment received after this booking changed. Refund review is required.':result.state==='CAPTURED'?'Cashfree sandbox payment verified. No real money was collected.':'Cashfree has not confirmed a successful payment. Check again if a payment is pending.');if(bookingId&&result.bookingId===bookingId&&result.bookingStatus==='confirmed')router.replace(`/account/checkout/${encodeURIComponent(bookingId)}`);router.refresh()}catch(error){setMessage(error instanceof Error?error.message:'Status check failed.')}finally{setPending(false)}}}>{pending?'Checking…':'Check Cashfree payment status'}</button><p role="status" className="text-sm">{message}</p></div>
}
export function CheckoutButton({invoiceId,requestKey,demo=false,bookingId}:{invoiceId?:string;requestKey:string;demo?:boolean;bookingId?:string}){
 const router=useRouter(),[message,setMessage]=useState(''),[pending,setPending]=useState(false),[complete,setComplete]=useState(false),[intent,setIntent]=useState(requestKey),[lastOrder,setLastOrder]=useState<string|null>(null)
 async function open(){
  setPending(true);setMessage('Preparing Cashfree sandbox checkout…')
  try{
   const response=await fetch('/api/payments/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invoiceId,requestKey:intent,demo})}),order=await response.json()
   if(!response.ok)throw new Error(order.error??'Order creation failed.')
   if(order.mode!=='sandbox'||typeof order.paymentSessionId!=='string'||typeof order.externalOrderId!=='string')throw new Error('A valid sandbox checkout session is required.')
   setLastOrder(order.externalOrderId);await loadCheckout()
   setMessage('Cashfree sandbox checkout is open. Use test payment details only.')
   const outcome=await window.Cashfree!({mode:'sandbox'}).checkout({paymentSessionId:order.paymentSessionId,redirectTarget:'_modal'})
   setMessage('Checking the payment with Cashfree…')
   const result=await verifyOrder(order.externalOrderId,demo),paid=result.state==='CAPTURED';setComplete(paid||result.state==='OVERPAYMENT')
   setMessage(result.state==='OVERPAYMENT'?'Payment received after this booking changed. Refund review is required.':paid?(demo?'Cashfree test payment verified. No real money was collected.':result.bookingStatus==='confirmed'?'Payment verified. Your appointment is scheduled.':'Sandbox payment verified. Your test invoice has been updated; no real money was collected.'):outcome?.error?'Checkout closed or failed. Payment has not been confirmed. Check the status before paying again.':'Payment is not yet confirmed. Check its status before paying again.')
   if(bookingId&&result.bookingId===bookingId&&result.bookingStatus==='confirmed')router.replace(`/account/checkout/${encodeURIComponent(bookingId)}`)
   router.refresh()
  }catch(error){setMessage(error instanceof Error?error.message:'Payment could not start.');router.refresh()}
  finally{setPending(false)}
 }
 return <div className="mt-4"><button type="button" disabled={pending||complete} className="care-button" onClick={open}>{pending?'Payment in progress…':demo?'Pay ₹100 in Cashfree sandbox':bookingId?'Pay and schedule appointment':'Open Cashfree sandbox checkout'}</button><p role="status" className="mt-3 text-sm">{message}</p>{lastOrder&&!pending&&!complete&&<PaymentStatusButton orderId={lastOrder} demo={demo} bookingId={bookingId}/>} {demo&&complete&&<button className="mt-3 min-h-11 text-sm font-semibold text-primary" onClick={()=>{setIntent('demo-request-'+crypto.randomUUID());setComplete(false);setLastOrder(null);setMessage('')}}>Start another test payment</button>}</div>
}
