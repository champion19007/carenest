import Link from 'next/link'
import {requireUser} from '@/lib/auth'
import {getDb,ensureSchema} from '@/lib/db/client'
import {patientAppointments,type AppointmentView} from '@/lib/domain/patient'
import {PatientWorkspace} from '@/components/patient-workspace'
import {AppointmentControls} from '@/components/appointment-controls'
import {LiveQueue} from '@/components/live-queue'
import {CheckIn} from '@/components/check-in'
import {slotDay,slotTime} from '@/lib/slot-format'
export const dynamic='force-dynamic'
export default async function AccountPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const user=await requireUser('/account'),params=await searchParams
 const data=await patientAppointments(user.id,typeof params.cursor==='string'?params.cursor:undefined)
 const selected=typeof params.requested==='string'?data.history.find(b=>b.id===params.requested):undefined
 const active=data.upcoming.filter(b=>!b.started_at),doctorIds=[...new Set(active.map(b=>b.doctor_id))]
 await ensureSchema()
 const slots=doctorIds.length?await getDb().query<{doctor_id:string;slot_id:string;slot_start:string}>(`SELECT doctor_id,slot_id,slot_start FROM provider.appointment_slots WHERE doctor_id=ANY($1::text[]) AND slot_start>now() AND slot_start<now()+interval '14 days' AND status='AVAILABLE' ORDER BY slot_start`,[doctorIds]):[]
 return <PatientWorkspace title="Your appointments" description="Requests require clinic acceptance. Dates and confirmation below come from your actual appointment records.">{selected&&<p role="status" className="mb-5 rounded-xl bg-soft p-4 text-sm">{selected.status==='confirmed'?'The clinic confirmed this appointment.':selected.status==='requested'?'Request sent. Awaiting clinic confirmation.':`Appointment status: ${selected.status}`}</p>}<section><h2 className="text-xl">Upcoming visits</h2><div className="mt-4 grid gap-5 lg:grid-cols-2">{data.upcoming.map(b=><article key={b.id} className="rounded-2xl border border-border bg-card p-5"><AppointmentDetails appointment={b}/>{b.status==='confirmed'&&b.kind==='video'&&<Link href={`/consult/${encodeURIComponent(b.id)}`} target="_blank" rel="noopener noreferrer" className="care-button mt-4">Join video consultation</Link>}{b.status==='confirmed'&&<><CheckIn bookingId={b.id}/><LiveQueue bookingId={b.id}/></>}<AppointmentControls id={b.id} revision={b.revision} slots={slots.filter(s=>s.doctor_id===b.doctor_id).map(s=>({slotId:s.slot_id,startsAt:s.slot_start}))}/></article>)}</div>{!data.upcoming.length&&<p className="mt-4 rounded-2xl border border-dashed border-border p-6 text-sm">No upcoming visits. <Link href="/search" className="text-primary">Find care</Link></p>}</section><section className="mt-9"><h2 className="text-xl">Appointment history</h2><div className="mt-4 space-y-3">{data.history.map(b=><article key={b.id} className="rounded-2xl border border-border bg-card p-5"><AppointmentDetails appointment={b}/></article>)}</div>{data.next&&<Link className="care-button mt-5" href={`/account?cursor=${encodeURIComponent(data.next)}`}>Older appointments</Link>}</section><Link href="/account/records" className="care-button mt-8">Open your consultation records</Link></PatientWorkspace>
}
function AppointmentDetails({appointment:b}:{appointment:AppointmentView}){return <><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg"><Link href={`/doctor/${b.doctor_slug}`}>{b.doctor_name}</Link></h3><p className="mt-1 text-sm text-muted-foreground">{b.speciality} · {b.clinic}</p></div><span className="rounded-lg bg-soft px-3 py-2 text-xs font-semibold">{b.status}</span></div><p className="mt-3 text-sm">For {b.subject_name}{b.pet_id?' (pet)':''} · {b.kind}</p><p className="mt-2 text-sm font-semibold">{b.starts_at?`${slotDay(b.starts_at)}, ${slotTime(b.starts_at)} · IST`:'Appointment time requires clinic review'} · ₹{b.fee}</p></>}
