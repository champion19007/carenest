import Link from 'next/link'
import {currentAdmin} from '@/lib/auth'
import {redirect} from 'next/navigation'
import {getDb,ensureSchema} from '@/lib/db/client'
import {PartnerForms} from '@/components/partner-forms'
export const dynamic='force-dynamic'
export default async function Partners(){if(!await currentAdmin())redirect('/admin');await ensureSchema();const clinics=await getDb().query<{id:string;name:string}>('SELECT id,name FROM clinic.clinics ORDER BY name LIMIT 500');return <main className="care-container py-8"><Link href="/admin" className="text-primary">← Admin</Link><h1 className="mt-5 text-3xl">Partner operations</h1><p className="mt-4 text-sm text-muted-foreground">Publication records an operator’s actual verification. It does not perform a government registration check automatically.</p><div className="mt-6"><PartnerForms/></div><h2 className="mt-8 text-xl">Clinic identifiers</h2><ul className="mt-4 space-y-2 text-sm">{clinics.map(c=><li key={c.id}>{c.name} · {c.id}</li>)}</ul></main>}
