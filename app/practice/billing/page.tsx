import {requireRole} from '@/lib/auth'
import {practiceData} from '@/lib/domain/practice'
import {BillingForm} from '@/components/billing-form'
import {formatPaise} from '@/lib/money'
export const dynamic='force-dynamic'
export default async function BillingPage(){const user=await requireRole('doctor','/practice/billing'),data=await practiceData(user.id);return <div><h1 className="text-3xl">Clinic billing</h1><p className="mt-3 text-sm text-muted-foreground">Invoices are generated from confirmed visits. Record only payments actually received.</p><div className="mt-6 grid gap-5 lg:grid-cols-2">{data.invoices.map(i=><section key={i.id} className="rounded-2xl border border-border bg-card p-5"><h2 className="text-xl">{formatPaise(i.total_paise)}</h2><p className="mt-2 text-xs">{i.id} · {i.state}</p>{i.state==='UNPAID'&&<BillingForm id={i.id} amount={i.total_paise}/>}</section>)}</div>{!data.invoices.length&&<p className="mt-6 rounded-2xl border border-dashed border-border p-6 text-sm">No invoices yet.</p>}</div>}
