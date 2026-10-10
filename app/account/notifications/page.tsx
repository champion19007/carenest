import Link from 'next/link'
import {fast2smsSelected,ownFast2smsMessages} from '@/lib/fast2sms'
import {notificationPreferences} from '@/lib/domain/notification-preferences'
import {NotificationPreferences} from '@/components/notification-preferences'
import {requireUser} from '@/lib/auth'
import {getDb,ensureSchema} from '@/lib/db/client'
import {PatientWorkspace} from '@/components/patient-workspace'
import {ownWhatsAppMessages,whatsappSetupNotice} from '@/lib/whatsapp'
import {WhatsAppTestButton,WhatsAppReceiptButton,RefreshUpdates} from '@/components/whatsapp-controls'
import {EmailTestButton} from '@/components/email-test-button'
import {emailConfigured} from '@/lib/email'
import {googleIsConfigured} from '@/lib/google'
import {metaWhatsAppSelected,ownMetaWhatsAppMessages,metaWhatsAppTemplateStatuses} from '@/lib/meta-whatsapp'
export const dynamic='force-dynamic'
export default async function UpdatesPage(){
 const user=await requireUser('/account/notifications');await ensureSchema()
 const items=await getDb().query<{id:string;title:string;body:string;created_at:string}>('SELECT id,title,body,created_at FROM patient.notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[user.id])
 const meta=metaWhatsAppSelected(),fast=!meta&&fast2smsSelected(),whatsapp=meta||fast?[]:await ownWhatsAppMessages(user.id),fastReceipts=fast?await ownFast2smsMessages(user.id):[],metaReceipts=meta?await ownMetaWhatsAppMessages(user.id):[]
 const metaTemplates=meta?await metaWhatsAppTemplateStatuses():[]
 const emails=await getDb().query<{state:string;error_code:string|null}>("SELECT state,error_code FROM notification_delivery WHERE user_id=$1 AND channel='email' ORDER BY updated_at DESC LIMIT 30",[user.id])
 return <PatientWorkspace title="Your updates" description="Booking confirmations and reminders through your selected channels. Reminders are scheduled ten minutes before your appointment.">
  <RefreshUpdates/>
  <section className="mb-6 rounded-2xl border bg-card p-5">
   <h2 className="text-xl">Google account and email</h2>
   <p className="mt-3 text-sm">{user.email_verified_at&&user.email?'Verified email: '+user.email:'Connect Google to verify the email that should receive your booking messages.'}</p>
   {googleIsConfigured()&&<Link href="/api/auth/google?intent=link" className="care-button mt-4">{user.google_sub?'Confirm your Google email':'Connect Google to this account'}</Link>}
   <p className="mt-3 text-sm">{emailConfigured()?'The email sender is configured. Enable Email booking updates below to receive confirmations and reminders.':'The email sender needs setup before messages can be sent. Your Google login can still work.'}</p>
   <EmailTestButton/>
   <div className="mt-4 space-y-2">{emails.map((r,index)=><p className="text-sm" key={index}>Email · {r.state}{r.error_code?' · needs provider review':''}</p>)}</div>
  </section>
  <NotificationPreferences preferences={await notificationPreferences(user.id)}/>
  {fast?<section className="mb-6 rounded-2xl border bg-card p-5">
   <h2 className="text-xl">SMS and WhatsApp updates</h2>
   <p className="mt-3 text-sm">WhatsApp confirmations and reminders need separate approved templates. Local update tests use the configured test phone. ACCEPTED means the provider accepted the request; check your phone for delivery.</p>
   <WhatsAppTestButton both/>
   <div className="mt-4 space-y-3">{fastReceipts.map(r=><article key={r.id} className="border-t pt-3"><p className="text-sm">{r.channel==='sms'?'SMS':'WhatsApp'} · {r.state}</p>{r.error_code&&<p className="mt-2 text-xs">Needs review: {r.error_code}</p>}</article>)}</div>
  </section>:<section className="mb-6 space-y-4 rounded-2xl border bg-card p-5">
   <h2 className="text-xl">WhatsApp phone delivery</h2><p className="text-sm">{whatsappSetupNotice()}</p>
   {meta&&<div className="space-y-2">{metaTemplates.map(t=><p key={t.kind} className="text-sm">{t.kind==='BOOKING'?'Appointment updates':t.kind==='REMINDER'?'Ten-minute reminders':t.kind==='TRANSACTION'?'Transaction receipts':'Optional account test'} · {t.status.replaceAll('_',' ')}</p>)}<p className="text-sm">After the Utility transaction template is approved, complete a Cashfree sandbox payment to test your receipt. A generic template classified as Marketing cannot send these account tests.</p></div>}
   {(!meta||metaTemplates.some(t=>t.kind==='UPDATE'&&t.status==='APPROVED'))&&<WhatsAppTestButton/>}
   {metaReceipts.map(item=><article key={item.id} className="border-t pt-4"><p className="text-sm font-semibold">Meta WhatsApp: {item.state}</p>{item.error_code&&<p className="mt-2 text-xs">Delivery needs provider review.</p>}</article>)}
   {whatsapp.map(item=><article key={item.id} className="border-t pt-4"><p className="text-sm font-semibold">WhatsApp: {item.state}</p>{item.provider_ref&&<WhatsAppReceiptButton id={item.id}/>} {item.error_code&&<p className="mt-2 text-xs">Delivery needs review: {item.error_code}</p>}</article>)}
  </section>}
  <div className="space-y-4">{items.map(i=><article key={i.id} className="rounded-2xl border border-border bg-card p-5"><h2 className="text-lg">{i.title}</h2><p className="mt-2 whitespace-pre-line text-sm">{i.body}</p><p className="mt-3 text-xs text-muted-foreground">{String(i.created_at).slice(0,16).replace('T',' ')} UTC</p></article>)}{!items.length&&<p className="rounded-2xl border border-dashed border-border p-6 text-sm">No messages yet. Keep CareNest running to process updates and reminders.</p>}</div>
 </PatientWorkspace>
}
