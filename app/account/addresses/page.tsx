import {requireUser} from '@/lib/auth'
import {ownAddresses} from '@/lib/domain/home-visits'
import {AddressForm} from '@/components/operations-forms'
import {PatientWorkspace} from '@/components/patient-workspace'
export const dynamic='force-dynamic'
export default async function Addresses(){const user=await requireUser('/account/addresses'),addresses=await ownAddresses(user.id);return <PatientWorkspace title="Private addresses" description="Home-visit addresses are shared only through your owned request and authorized clinic dispatch."><div className="grid gap-5 lg:grid-cols-2"><AddressForm/><div className="space-y-4">{addresses.map(a=><article key={a.id} className="rounded-2xl border border-border p-5"><h2 className="text-lg">{a.label}</h2><p>{a.street}</p><p>{a.locality}, {a.city} · {a.pin}</p></article>)}</div></div></PatientWorkspace>}
