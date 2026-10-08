import {requireUser} from '@/lib/auth'
import {mobileDevices} from '@/lib/domain/mobile'
import {PatientWorkspace} from '@/components/patient-workspace'
import {MobilePairForm,RevokeDeviceForm} from '@/components/mobile-device-forms'
export const dynamic='force-dynamic'
export default async function MobileDevices(){const u=await requireUser('/account/mobile'),devices=await mobileDevices(u.id);return <PatientWorkspace title="Your mobile devices" description="Pair your local native app through your signed-in account. Device access expires after seven days; offline appointment intents are encrypted and record caching needs explicit device opt-in."><MobilePairForm/><div className="mt-6 space-y-4">{devices.map(d=><article key={d.id} className="rounded-2xl border p-5"><p>{d.id}</p><p className="text-sm">Last connected: {d.last_seen_at} · expires {d.expires_at} · {d.revoked_at?'Revoked':'Active'}</p>{!d.revoked_at&&<RevokeDeviceForm id={d.id}/>}</article>)}</div></PatientWorkspace>}
