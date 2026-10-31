import Link from 'next/link'
import {House,Clock3} from 'lucide-react'
import {requireUser} from '@/lib/auth'
import {ownHomeCareRequests} from '@/lib/domain/home-care'
import {careDate,careServiceName,careStatuses} from '@/lib/home-care'
import {PatientWorkspace} from '@/components/patient-workspace'
import {HomeCareControls} from '@/components/home-care-request-form'
export const dynamic='force-dynamic'
export const metadata={title:'Your home-care requests · CareNest'}
export default async function HomeCareHistory(){const user=await requireUser('/account/home-care'),requests=await ownHomeCareRequests(user.id)
 return <PatientWorkspace title="Your home-care requests" description="Track nursing, home visits and supported stays. Requests need review before care can be arranged."><Link href="/home-care" className="care-button mb-6">Request care</Link><div className="grid gap-5 lg:grid-cols-2">{requests.map(r=><article key={r.id} className="care-panel p-5 sm:p-6"><p className="care-status"><Clock3 className="size-4"/>{careStatuses[r.status]}</p><h2 className="mt-3 text-xl">{careServiceName(r.service_kind,r.audience)}</h2><p className="mt-2 text-sm">{r.subject_name} · {r.city}{r.pin_code&&` · ${r.pin_code}`}</p><p className="mt-2 text-sm text-muted-foreground">{careDate(r.starts_on)}{r.ends_on?` – ${careDate(r.ends_on)}`:` · ${r.time_window} (IST)`}</p>{r.details.notes&&<p className="mt-4 whitespace-pre-wrap break-words text-sm">{r.details.notes}</p>}{r.details.reviewNote&&<div className="care-home-note mt-4"><h3 className="text-sm">Care team response</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm">{r.details.reviewNote}</p></div>}<HomeCareControls id={r.id} revision={r.revision} status={r.status}/></article>)}</div>{!requests.length&&<section className="care-panel p-8"><House className="size-8 text-muted-foreground"/><h2 className="mt-4 text-xl">No care requests yet</h2><p className="mt-3 max-w-lg text-muted-foreground">Start with the person or pet who needs care. Your requests and care-team responses will appear here.</p></section>}</PatientWorkspace>
}
