'use client'
import {useEffect,useState} from 'react'
import {useRouter} from 'next/navigation'
import {CheckoutButton} from './checkout-button'

export function AppointmentPayment({invoiceId,bookingId,deadline}:{invoiceId:string;bookingId:string;deadline:string}){
 const router=useRouter(),[remaining,setRemaining]=useState<number|null>(null)
 useEffect(()=>{
  let refreshed=false
  const tick=()=>{const seconds=Math.max(0,Math.ceil((Date.parse(deadline)-Date.now())/1000));setRemaining(seconds);if(seconds===0&&!refreshed){refreshed=true;router.refresh()}}
  tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer)
 },[deadline,router])
 return <div><p role="status" className="mt-3 text-sm font-semibold">{remaining===null?'Your appointment time is temporarily held.':remaining>0?`${Math.floor(remaining/60)}m ${String(remaining%60).padStart(2,'0')}s left to pay`:'Payment hold expired. Refreshing availability…'}</p>{remaining!==0&&<CheckoutButton invoiceId={invoiceId} requestKey={'booking-payment-'+bookingId} bookingId={bookingId}/>}</div>
}
