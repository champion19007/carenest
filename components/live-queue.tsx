'use client'
import {useEffect,useState} from 'react'
import {slotTime} from '@/lib/slot-format'
type Status={ahead:number;estimatedStart:string;measuredAt:string;isDone:boolean}
export function LiveQueue({bookingId}:{bookingId:string}) {
 const [status,setStatus]=useState<Status|null>(null),[failed,setFailed]=useState(false)
 useEffect(()=>{let active=true;const controller=new AbortController();const read=async()=>{if(document.visibilityState!=='visible')return;try{const response=await fetch(`/api/queue/${bookingId}`,{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error();const body=await response.json();if(active){setStatus(body.status);setFailed(false)}}catch{if(active)setFailed(true)}};void read();const timer=setInterval(read,30000);return()=>{active=false;clearInterval(timer);controller.abort()}},[bookingId])
 if(failed)return <p className="mt-4 text-xs text-muted-foreground">Queue status could not be refreshed. Check with the clinic.</p>
 if(!status)return null
 return <div aria-live="polite" className="mt-4 rounded-xl border border-border bg-soft p-4"><p className="text-sm font-semibold">{status.ahead} checked-in {status.ahead===1?'patient':'patients'} ahead</p><p className="mt-2 text-xs text-muted-foreground">Estimated start around {slotTime(status.estimatedStart)}. Refreshed {slotTime(status.measuredAt)}. Clinic progress can change this estimate.</p></div>
}
