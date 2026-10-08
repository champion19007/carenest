import {requireUser} from '@/lib/auth'
import {labStaffOrders} from '@/lib/domain/labs'
import {PatientWorkspace} from '@/components/patient-workspace'
import {LabTransitionForm} from '@/components/lab-order-forms'
export const dynamic='force-dynamic'
export default async function LabStaff(){const user=await requireUser('/staff/labs'),orders=await labStaffOrders(user.id);return <PatientWorkspace title="Lab operations" description="Orders are scoped to your active laboratory memberships."><div className="grid gap-5 lg:grid-cols-2">{orders.map(o=><section key={o.id} className="rounded-2xl border border-border bg-card p-5"><h2 className="text-xl">{o.name} · {o.patient_name}</h2><p className="mt-3 text-sm">{o.state}</p><LabTransitionForm orderId={o.id}/></section>)}{!orders.length&&<p className="text-sm">No assigned laboratory orders. This page does not grant membership.</p>}</div></PatientWorkspace>}
