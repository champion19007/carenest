import Link from 'next/link'
import {notFound} from 'next/navigation'
import {requireUser} from '@/lib/auth'
import {hostedDemoVideoHostId} from '@/lib/demo-booking'
import {demoHostAppointments} from '@/lib/domain/demo-video'
import {PatientWorkspace} from '@/components/patient-workspace'
import {slotDay,slotTime} from '@/lib/slot-format'
export const dynamic='force-dynamic'
export const metadata={title:'Demo video host · CareNest',robots:{index:false}}
export default async function DemoVideoHost(){
 const user=await requireUser('/account/demo-video')
 if(hostedDemoVideoHostId()!==user.id)notFound()
 const calls=await demoHostAppointments(user.id)
 return <PatientWorkspace title="Demo video host" description="Host a test call with the account that booked a sample video appointment. No medical care is provided.">
  <p className="rounded-xl bg-soft p-4 text-sm leading-7">Use a separate patient account to book and complete Cashfree sandbox checkout. Joining opens 10 minutes before the appointment and closes 30 minutes after its end. Camera and microphone start off; recording is disabled.</p>
  <div className="mt-6 grid gap-4 sm:grid-cols-2">{calls.map(call=><article key={call.id} className="rounded-xl border border-border bg-card p-5"><h2 className="text-lg">{call.doctor_name} · sample profile</h2><p className="mt-2 text-sm">{slotDay(call.starts_at)} · {slotTime(call.starts_at)}–{slotTime(call.ends_at)} IST</p><Link href={`/consult/${encodeURIComponent(call.id)}`} className="care-button mt-4">Open demo video call</Link></article>)}</div>
  {!calls.length&&<p className="mt-6 text-muted-foreground">No paid, confirmed demo video appointments are waiting.</p>}
 </PatientWorkspace>
}
