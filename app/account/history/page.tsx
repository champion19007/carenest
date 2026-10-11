import Link from 'next/link'
import {requireUser} from '@/lib/auth'
import {consultationHistory} from '@/lib/domain/consultation-history'
import {DomainError} from '@/lib/domain/errors'
import {PatientWorkspace} from '@/components/patient-workspace'

export const dynamic='force-dynamic'
const dateFormat=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'long',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true})
const modeLabel:Record<string,string>={video:'Video consultation',clinic:'Clinic consultation',home_visit:'Home consultation'}

export default async function ConsultationHistoryPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const user=await requireUser('/account/history'),params=await searchParams
 let history:Awaited<ReturnType<typeof consultationHistory>>
 try{history=await consultationHistory(user.id,typeof params.cursor==='string'?params.cursor:undefined)}
 catch(error){
  if(error instanceof DomainError&&error.code==='CURSOR')return <PatientWorkspace title="Consultation history"><p role="alert">This history link is invalid.</p><Link href="/account/history" className="care-button mt-4">Open latest consultations</Link></PatientWorkspace>
  throw error
 }
 return <PatientWorkspace title="Consultation history" description="Your completed consultations with doctors and veterinarians. Video calls are not recorded by CareNest; this history keeps the visit details.">
  <div className="space-y-4">{history.items.map(visit=><article key={visit.id} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
   <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl"><Link href={`/doctor/${encodeURIComponent(visit.doctor_slug)}`} className="hover:text-primary">{visit.doctor_name}</Link></h2><p className="mt-1 text-sm text-muted-foreground">{visit.speciality} · {visit.clinic}</p></div><span className="rounded-lg bg-soft px-3 py-2 text-xs font-semibold">Completed</span></div>
   <p className="mt-4 font-semibold"><time dateTime={visit.visited_at}>{dateFormat.format(new Date(visit.visited_at))}</time> · IST</p>
   <p className="mt-2 text-sm">For {visit.subject_name}{visit.subject_kind==='pet'?' (pet)':''} · {modeLabel[visit.kind]??'Consultation'}</p>
   <p className="mt-3 text-xs text-muted-foreground">{visit.started_at?'Consultation start recorded by the clinic.':'Appointment time shown; the clinic marked this visit as completed.'}</p>
  </article>)}</div>
  {!history.items.length&&<div className="rounded-2xl border border-dashed border-border p-6"><p>{params.cursor?'No older completed consultations.':'No completed consultations yet. A visit appears here after the clinic marks it as attended.'}</p><Link href="/account" className="care-button mt-4">Your appointments</Link></div>}
  <nav aria-label="Consultation history pages" className="mt-6 flex flex-wrap gap-3">{params.cursor&&<Link href="/account/history" className="care-button">Latest consultations</Link>}{history.next&&<Link href={`/account/history?cursor=${encodeURIComponent(history.next)}`} className="care-button">Older consultations</Link>}</nav>
  <div className="mt-8 flex flex-wrap gap-3"><Link href="/account/records" className="care-button">Open care records</Link><Link href="/account/billing" className="care-button">View invoices</Link></div>
 </PatientWorkspace>
}
