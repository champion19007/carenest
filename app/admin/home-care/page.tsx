import Link from 'next/link'
import {redirect} from 'next/navigation'
import {currentAdmin} from '@/lib/auth'
import {adminHomeCareRequests} from '@/lib/domain/home-care'
import {careDate,careServiceName,careStatuses} from '@/lib/home-care'
import {HomeCareControls} from '@/components/home-care-request-form'
export const dynamic='force-dynamic'
export default async function HomeCareQueue(){const admin=await currentAdmin();if(!admin)redirect('/admin');const requests=await adminHomeCareRequests(admin.id)
 return <main className="care-container py-8"><Link className="care-text-link" href="/admin">← Admin</Link><h1 className="mt-5 text-3xl">Home-care requests</h1><p className="mt-3 text-muted-foreground">Review only consented requests. Responses are visible to the patient. Confirm partners, suitability and fees before making arrangements.</p><div className="mt-7 grid gap-5 lg:grid-cols-2">{requests.map(r=><article className="care-panel p-6" key={r.id}><p className="care-status">{careStatuses[r.status]}</p><h2 className="mt-3 text-xl">{careServiceName(r.service_kind,r.audience)}</h2><p className="mt-3 text-sm">{r.subject_name} · {r.city} · {r.pin_code}</p><p className="mt-2 text-sm">{careDate(r.starts_on)}{r.ends_on?` – ${careDate(r.ends_on)}`:` · ${r.time_window} (IST)`}</p><p className="mt-3 break-words text-sm">Contact: {r.contact_name} · {r.phone??r.email??'Unavailable'}</p><p className="mt-4 whitespace-pre-wrap break-words text-sm">{r.details.notes||'No extra notes.'}</p>{r.details.reviewNote&&<p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">Last response: {r.details.reviewNote}</p>}<HomeCareControls id={r.id} revision={r.revision} status={r.status} admin/></article>)}</div>{!requests.length&&<p className="care-panel mt-6 p-6 text-muted-foreground">No care requests have been submitted.</p>}</main>
}
