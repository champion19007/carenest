import Link from 'next/link'
import {currentAdmin} from '@/lib/auth'
import {redirect} from 'next/navigation'
import {deadLetters,pendingCount} from '@/lib/db/outbox'
import {supportCases} from '@/lib/domain/support'
import {SupportCaseControls} from '@/components/support-case-controls'
import {RetryEventForm} from '@/components/support-forms'
export const dynamic='force-dynamic'
export default async function Operations(){const admin=await currentAdmin();if(!admin)redirect('/admin');const[events,pending,cases]=await Promise.all([deadLetters(),pendingCount(),supportCases(admin.id,true)]);return <main className="care-container py-8"><Link href="/admin" className="text-primary">← Admin</Link><h1 className="mt-5 text-3xl">Operations</h1><p className="mt-4 text-sm">Pending events: {pending}</p><h2 className="mt-7 text-xl">Failed jobs</h2><div className="mt-4 grid gap-4 lg:grid-cols-2">{events.map(e=><article key={String(e.id)} className="rounded-2xl border border-border bg-card p-5"><p className="text-sm font-semibold">{e.kind} · event {String(e.id)}</p><p className="mt-2 text-xs">{e.last_error} · attempts {e.attempts}</p><RetryEventForm id={String(e.id)}/></article>)}</div><h2 className="mt-8 text-xl">Support cases</h2><div className="mt-4 space-y-4">{cases.map(c=><article key={c.id} className="rounded-2xl border border-border bg-card p-5"><h3 className="text-lg">{c.subject}</h3><p className="mt-3 whitespace-pre-wrap text-sm">{c.detail}</p><p className="mt-3 text-xs">{c.id} · {c.state}</p><SupportCaseControls id={c.id} state={c.state}/></article>)}</div></main>}
