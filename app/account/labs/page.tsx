import {requireUser} from '@/lib/auth'
import {ownLabOrders} from '@/lib/domain/labs'
import {PatientWorkspace} from '@/components/patient-workspace'
import {formatPaise} from '@/lib/money'
import {slotDay,slotTime} from '@/lib/slot-format'
export const dynamic='force-dynamic'
export default async function LabOrders(){const user=await requireUser('/account/labs'),orders=await ownLabOrders(user.id);return <PatientWorkspace title="Your lab orders" description="Collection and result states come from the assigned laboratory workflow."><div className="space-y-5">{orders.map(o=><article key={o.id} className="rounded-2xl border border-border bg-card p-5"><h2 className="text-xl">{o.name}{o.is_demo?' · sample workflow':''}</h2><p className="mt-3 text-sm">{o.state} · {formatPaise(o.fee_paise)} · payment {o.invoice_state}</p>{o.scheduled_at&&<p className="mt-3 text-sm">Collection: {slotDay(o.scheduled_at)}, {slotTime(o.scheduled_at)} IST</p>}{o.result_file_id&&<a className="care-button mt-4" href={`/api/files/${o.result_file_id}`}>Download your result</a>}</article>)}{!orders.length&&<p className="rounded-2xl border border-dashed border-border p-6 text-sm">No lab requests yet.</p>}</div></PatientWorkspace>}
