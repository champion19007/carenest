import Link from 'next/link'
import {requireRole,newId} from '@/lib/auth'
import {clinicEncounters,readEncounter} from '@/lib/domain/clinical'
import {PrescriptionSafetyForm} from '@/components/pharmacy-forms'
import {ClinicalEditor} from '@/components/clinical-editor'
import {ClinicalRecordBody} from '@/components/clinical-record-body'
import {slotDay,slotTime} from '@/lib/slot-format'
export const dynamic='force-dynamic'
export default async function PatientsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const user=await requireRole('doctor','/practice/patients'),allEncounters=await clinicEncounters(user.id),params=await searchParams
 const search=typeof params.q==='string'?params.q.trim().slice(0,80).toLocaleLowerCase():''
 const encounters=search?allEncounters.filter(e=>e.patient_name.toLocaleLowerCase().includes(search)):allEncounters
 const requested=typeof params.encounter==='string'?params.encounter:''
 const selected=requested?encounters.find(e=>e.id===requested):encounters[0]
 const chart=selected?await readEncounter(user.id,selected.id):null
 return <div className="space-y-6"><div><h1 className="text-3xl">Patient encounters</h1><p className="mt-3 text-sm text-muted-foreground">Assigned consultations and signed records. Every record access is audited.</p></div><nav aria-label="Select encounter" className="no-scrollbar flex gap-3 overflow-x-auto">{encounters.map(e=><Link key={e.id} href={`/practice/patients?encounter=${e.id}`} className={`min-h-11 shrink-0 rounded-xl border p-3 text-sm ${selected?.id===e.id?'border-primary bg-soft':'border-border bg-card'}`}>{e.patient_name} · {e.subject_kind}<span className="ml-2 text-xs text-muted-foreground">{slotDay(e.starts_at)}, {slotTime(e.starts_at)} · IST</span></Link>)}</nav>{chart&&selected?<><h2 className="text-xl">{selected.patient_name} · {selected.status}</h2><ClinicalEditor key={selected.id} encounterId={selected.id} patientName={selected.patient_name} initialNoteKey={newId('clinical-note')} initialRxKey={newId('clinical-rx')}/><section className="space-y-4"><h2 className="text-xl">Saved record versions</h2>{chart.records.map(r=><article key={r.id} className="rounded-2xl border border-border bg-card p-5"><p className="text-sm font-semibold">{r.collection==='prescriptions'?'Prescription':'Clinical note'} · version {r.revision}</p><ClinicalRecordBody body={r.body}/>{r.collection==='prescriptions'&&<PrescriptionSafetyForm id={r.id}/>}</article>)}</section></>:<p className="rounded-2xl border border-dashed border-border p-7 text-sm">Confirm a genuine appointment to create an encounter. Start the assigned consultation before writing clinical notes.</p>}</div>
}
