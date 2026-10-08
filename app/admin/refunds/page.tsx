import Link from 'next/link'
import {currentAdmin} from '@/lib/auth'
import {redirect} from 'next/navigation'
import {getDb,ensureSchema} from '@/lib/db/client'
import {RefundApprovalForm} from '@/components/refund-forms'
import {formatPaise} from '@/lib/money'
export const dynamic='force-dynamic'
export default async function Refunds(){const admin=await currentAdmin();if(!admin)redirect('/admin');await ensureSchema();const rows=await getDb().query<{id:string;amount_paise:string;reason:string;state:string}>("SELECT id,amount_paise,reason,state FROM refunds ORDER BY created_at DESC LIMIT 100");return <main className="care-container py-8"><Link href="/admin" className="text-primary">← Admin</Link><h1 className="mt-5 text-3xl">Refund operations</h1><div className="mt-6 space-y-5">{rows.map(r=><section key={r.id} className="rounded-2xl border border-border bg-card p-5"><h2 className="text-xl">{formatPaise(r.amount_paise)} · {r.state}</h2><p className="mt-3 text-sm">{r.reason}</p>{r.state==='REQUESTED'&&<RefundApprovalForm id={r.id}/>}</section>)}</div><p className="mt-5 text-sm text-muted-foreground">UNKNOWN outcomes require provider reconciliation. Retrying blindly can refund twice. Local mode permits configured gateway test keys only.</p></main>}
