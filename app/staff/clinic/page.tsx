import Link from 'next/link'
import {requireUser,newId} from '@/lib/auth'
import {getDb,ensureSchema} from '@/lib/db/client'
import {ownClinics,clinicAccess} from '@/lib/domain/clinic-access'
import {clinicWalkIns} from '@/lib/domain/walk-ins'
import {WalkInForm,WalkInActions} from '@/components/operations-forms'
import {BillingForm} from '@/components/billing-form'
import {slotTime} from '@/lib/slot-format'
export const dynamic='force-dynamic'
export default async function ClinicDesk({searchParams}:{searchParams:Promise<{clinic?:string}>}){
 const user=await requireUser('/staff/clinic');await ensureSchema();const db=getDb(),clinics=await ownClinics(db,user.id),params=await searchParams,selected=clinics.find(c=>c.id===params.clinic)??clinics.find(c=>['clinician','receptionist','administrator'].includes(c.role))
 if(!selected)return <main className="care-container py-10"><h1 className="text-3xl">Clinic arrivals</h1><p className="mt-4">Your account has no active clinic desk assignment.</p></main>
 await clinicAccess(db,user.id,selected.id,['clinician','receptionist','administrator']);const arrivals=await clinicWalkIns(user.id,selected.id),doctors=await db.query<{id:string;name:string}>("SELECT id,name FROM provider.doctors WHERE clinic_id=$1 AND status='ACTIVE' ORDER BY name",[selected.id])
 return <main className="care-container py-10"><Link href="/account" className="text-primary">← Account</Link><h1 className="mt-4 text-3xl">{selected.name} · arrivals</h1><nav className="my-5 flex gap-4">{clinics.map(c=><Link key={c.id} href={`/staff/clinic?clinic=${c.id}`}>{c.name}</Link>)}<Link href={`/staff/dispatch?clinic=${selected.id}`}>Home visit dispatch</Link></nav><div className="grid gap-6 lg:grid-cols-2"><WalkInForm clinicId={selected.id} doctors={doctors} requestKey={newId('walk-in')}/><section className="space-y-4"><h2 className="text-xl">Today’s arrivals</h2>{arrivals.map(w=><article key={w.id} className="rounded-2xl border border-border bg-card p-5"><h3 className="text-lg">{w.identity.name}</h3><p className="mt-2 text-sm">{w.doctor_name} · {w.state} · arrived {slotTime(w.checked_in_at)} IST</p><p className="mt-2 text-sm">{w.identity.reason}</p><WalkInActions id={w.id} revision={w.revision} state={w.state}/><p className="mt-3 text-sm">Invoice: {w.invoice_state}</p>{w.invoice_state==='UNPAID'&&<BillingForm id={w.invoice_id} amount={w.fee_paise}/>}</article>)}</section></div></main>
}
