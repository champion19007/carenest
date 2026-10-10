import Link from 'next/link'
import {redirect} from 'next/navigation'
import {currentAdmin} from '@/lib/auth'
import {ensureSchema,getDb} from '@/lib/db/client'
import {payoutsConfigured} from '@/lib/cashfree-payouts'
import {PayoutBeneficiaryForm,PayoutQueueCheck} from '@/components/payout-forms'
import {formatPaise} from '@/lib/money'
export const dynamic='force-dynamic'
export default async function Payouts(){
 if(!await currentAdmin())redirect('/admin');await ensureSchema()
 const doctors=await getDb().query<{id:string;name:string;beneficiary_id:string|null}>("SELECT d.id,d.name,a.beneficiary_id FROM provider.doctors d JOIN patient.users u ON u.id=d.user_id LEFT JOIN doctor_payout_accounts a ON a.doctor_id=d.id WHERE d.status='ACTIVE' AND d.verified_at IS NOT NULL AND u.role='doctor' AND u.status='ACTIVE' AND u.kyc_level='verified' ORDER BY d.name LIMIT 100")
 const payouts=await getDb().query<{id:string;doctor_name:string;amount_paise:string;state:string;status_code:string|null}>("SELECT p.*,d.name doctor_name FROM doctor_payouts p JOIN provider.doctors d ON d.id=p.doctor_id ORDER BY p.created_at DESC LIMIT 100")
 return <main className="care-container py-8"><Link href="/admin" className="text-primary">← Admin</Link><h1 className="mt-5 text-3xl">Doctor payouts · sandbox</h1><p className="mt-3 text-sm leading-7">A paid consultation becomes eligible only after the assigned doctor marks it completed. Refunds block new payouts. Payment Gateway and Payouts have separate credentials. A provider-accepted transfer stays pending until Cashfree reports completed bank credit.</p><p className="my-5 rounded-xl bg-soft p-4 text-sm">{payoutsConfigured()?'Cashfree Payouts sandbox enabled.':'Payouts awaiting setup. Activate Cashfree Payouts test mode, save the separate sandbox keys and enable doctor payouts in the private environment file. Add and verify each doctor’s test beneficiary in Cashfree.'}</p><PayoutQueueCheck/><div className="mt-6 grid gap-5 lg:grid-cols-2">{doctors.map(d=><section key={d.id} className="rounded-2xl border border-border p-5"><h2 className="text-xl">{d.name}</h2><p className="mt-2 text-sm">{d.beneficiary_id?'Linked: '+d.beneficiary_id:'No verified payout destination'}</p><PayoutBeneficiaryForm doctorId={d.id}/></section>)}</div><h2 className="mt-8 text-xl">Payout history</h2><div className="mt-4 space-y-3">{payouts.map(p=><article key={p.id} className="rounded-xl border border-border p-4"><p>{p.doctor_name} · {formatPaise(p.amount_paise)} · {p.state}</p><p className="mt-2 text-xs">{p.id} {p.status_code&&'· '+p.status_code}</p></article>)}{!payouts.length&&<p className="text-sm">No completed paid consultations queued yet.</p>}</div></main>
}
