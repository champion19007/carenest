'use client'
import {useActionState,useEffect} from 'react'
import {useRouter} from 'next/navigation'
import {requestWhatsAppTest,checkWhatsAppReceipt} from '@/app/actions/notifications'
export function WhatsAppTestButton({both=false}:{both?:boolean}){const[s,a,p]=useActionState(requestWhatsAppTest,{});return <form action={a}><button className="care-button" disabled={p}>{p?'Queueing…':both?'Send SMS/WhatsApp test update':'Send WhatsApp test update'}</button><p role="status" className="mt-3 text-sm">{s.error??s.notice}</p></form>}
export function WhatsAppReceiptButton({id}:{id:string}){const[s,a,p]=useActionState(checkWhatsAppReceipt,{});return <form action={a} className="mt-3"><input type="hidden" name="id" value={id}/><button className="care-button" disabled={p}>{p?'Checking…':'Check phone delivery'}</button><p role="status" className="mt-2 text-sm">{s.error??s.notice}</p></form>}
export function RefreshUpdates(){const router=useRouter();useEffect(()=>{const timer=setInterval(()=>router.refresh(),10000);return()=>clearInterval(timer)},[router]);return null}
