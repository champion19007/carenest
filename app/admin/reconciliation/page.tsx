import Link from 'next/link'
import {currentAdmin} from '@/lib/auth'
import {AdminGate} from '@/components/admin-gate'
import {reconciliationCases} from '@/lib/domain/reconciliation'
import {ScanLegacyForm,LinkLegacyForm} from '@/components/reconciliation-forms'
export const dynamic='force-dynamic'
export default async function Reconciliation(){const a=await currentAdmin();if(!a)return <AdminGate firstRun={false}/>;const rows=await reconciliationCases(a.id);return <main className="care-container py-10"><Link href="/admin">← Administrator</Link><h1 className="my-5 text-3xl">Legacy record reconciliation</h1><p className="mb-5">Unscoped clinical records stay unavailable to patients and providers until the original subject and clinician match an existing encounter. An import is labelled as imported and does not imply a new clinical signature.</p><ScanLegacyForm/><section className="mt-6 space-y-5">{rows.map(r=><article key={r.id} className="rounded-2xl border p-5"><p>{r.document_id} · {r.collection} · {r.state} · {r.created_at}</p>{r.state==='PENDING'&&<LinkLegacyForm id={r.id}/>}</article>)}</section></main>}
