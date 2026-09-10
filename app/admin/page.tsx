import { Activity, Database, FileText, Stethoscope, UsersRound } from 'lucide-react'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { AdminGate } from '@/components/admin-gate'
import { adminLogout } from '@/app/actions/auth'
import { currentAdmin } from '@/lib/auth'
import {
  countBookings,
  countDoctors,
  countUsers,
  listBookings,
  listDoctors,
  listUsers,
  countActiveSessions,
  countAdmins,
} from '@/lib/db/sql'
import {
  chartNotes,
  countDocs,
  prescriptions,
  recentActivity,
  reviews,
  triageForMany,
} from '@/lib/db/docs'
import { listLeadsWithEstimateFlag } from '@/lib/db/leads'
import { LeadQueue } from '@/components/lead-queue'

export const metadata = { title: 'Admin console · CareNest' }
export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const admin = await currentAdmin()
  if (!admin) return <AdminGate firstRun={await countAdmins() === 0} />

  const [leads, allDoctors] = await Promise.all([listLeadsWithEstimateFlag(), listDoctors()])

  /* One query for every lead's triage rather than one per row. */
  const triage = await triageForMany(leads.map((lead) => lead.id))
  const leadsWithTriage = leads.map((lead) => ({
    ...lead,
    triage: triage.get(lead.id) ?? null,
  }))
  /* Only listed, active clinicians can receive a referral. */
  const routable = allDoctors.filter((doctor) => doctor.status === 'ACTIVE')

  const [users, doctors, bookings, feed] = [
    await listUsers(50),
    await listDoctors(50),
    await listBookings(50),
    await recentActivity(40),
  ]

  const stats = [
    { Icon: UsersRound, label: 'Patients', value: await countUsers(), source: 'SQL' },
    { Icon: Stethoscope, label: 'Doctors', value: await countDoctors(), source: 'SQL' },
    { Icon: FileText, label: 'Bookings', value: await countBookings(), source: 'SQL' },
    { Icon: Activity, label: 'Active sessions', value: await countActiveSessions(), source: 'SQL' },
    { Icon: Database, label: 'Prescriptions', value: await countDocs(prescriptions), source: 'NoSQL' },
    { Icon: Database, label: 'Chart notes', value: await countDocs(chartNotes), source: 'NoSQL' },
    { Icon: Database, label: 'Reviews', value: await countDocs(reviews), source: 'NoSQL' },
  ]

  return (
    <main className="min-h-screen bg-surface">
      <header className="border-b border-border bg-banner text-banner-foreground">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-4">
            <Logo onDark />
            <span className="text-sm font-semibold text-banner-muted">Admin · {admin.username}</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle compact />
            <form action={adminLogout}>
              <button
                type="submit"
                className="rounded-lg border border-banner-foreground/30 px-4 py-2.5 font-semibold"
              >
                Lock
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1320px] space-y-8 px-5 py-8 lg:px-8">
        <section className="rounded-xl border border-border bg-background p-6">
          <h1 className="text-2xl">Surgery enquiries</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Every enquiry is read here before it reaches anyone. Approving one lets you send it to
            a surgeon, a diagnostic centre, or both.
          </p>
          <div className="mt-6">
            <LeadQueue
              leads={leadsWithTriage}
              doctors={routable.map((d) => ({
                id: d.id,
                name: d.name,
                speciality: d.speciality,
              }))}
            />
          </div>
        </section>

        <section>
          <h1 className="text-3xl">Overview</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Live counts straight from Postgres. Structured records sit in the patient, provider
            and clinic schemas; anything free-form sits in the JSONB document store.
          </p>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map(({ Icon, label, value, source }) => (
              <div key={label} className="rounded-xl border border-border bg-background p-5">
                <div className="flex items-center justify-between">
                  <Icon className="size-5 text-accent" />
                  <span className="rounded bg-muted px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">
                    {source}
                  </span>
                </div>
                <dd className="mt-4 text-3xl font-extrabold">{value}</dd>
                <dt className="text-sm text-muted-foreground">{label}</dt>
              </div>
            ))}
          </dl>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <section className="overflow-hidden rounded-xl border border-border bg-background">
            <h2 className="border-b border-border px-5 py-4 text-xl">
              Patients <span className="text-sm text-muted-foreground">(SQL · users)</span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="border-b border-border text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3">Name</th>
                    <th className="px-5 py-3">Phone</th>
                    <th className="px-5 py-3">Joined</th>
                    <th className="px-5 py-3">Last login</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="px-5 py-3 font-semibold">{user.name || '—'}</td>
                      <td className="px-5 py-3 font-mono text-xs">+91 {user.phone}</td>
                      <td className="px-5 py-3 text-muted-foreground">{fmt(user.created_at)}</td>
                      <td className="px-5 py-3 text-muted-foreground">{fmt(user.last_login_at)}</td>
                    </tr>
                  ))}
                  {users.length === 0 && <Empty colSpan={4} label="No patients have signed up yet." />}
                </tbody>
              </table>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-background">
            <h2 className="border-b border-border px-5 py-4 text-xl">
              Activity <span className="text-sm text-muted-foreground">(NoSQL · activity)</span>
            </h2>
            <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto">
              {feed.map((entry) => (
                <li key={entry._id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded bg-soft px-2 py-0.5 font-mono text-[0.65rem] font-bold text-primary">
                      {entry.kind}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {fmt(entry.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm">{entry.message}</p>
                </li>
              ))}
              {feed.length === 0 && (
                <li className="px-5 py-12 text-center text-muted-foreground">
                  Nothing logged yet.
                </li>
              )}
            </ul>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="overflow-hidden rounded-xl border border-border bg-background">
            <h2 className="border-b border-border px-5 py-4 text-xl">
              Doctors <span className="text-sm text-muted-foreground">(SQL · doctors)</span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="border-b border-border text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3">Name</th>
                    <th className="px-5 py-3">Speciality</th>
                    <th className="px-5 py-3">City</th>
                    <th className="px-5 py-3">Verified</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {doctors.map((doctor) => (
                    <tr key={doctor.id}>
                      <td className="px-5 py-3 font-semibold">{doctor.name}</td>
                      <td className="px-5 py-3 text-muted-foreground">{doctor.speciality}</td>
                      <td className="px-5 py-3 text-muted-foreground">{doctor.city}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-bold ${
                            doctor.status === 'ACTIVE'
                              ? 'bg-success/10 text-success'
                              : 'bg-accent/15 text-warning'
                          }`}
                        >
                          {doctor.status === 'ACTIVE' ? 'Verified' : doctor.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {doctors.length === 0 && <Empty colSpan={4} label="No doctors seeded yet." />}
                </tbody>
              </table>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-background">
            <h2 className="border-b border-border px-5 py-4 text-xl">
              Bookings <span className="text-sm text-muted-foreground">(SQL · bookings)</span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="border-b border-border text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3">Doctor</th>
                    <th className="px-5 py-3">Kind</th>
                    <th className="px-5 py-3">Slot</th>
                    <th className="px-5 py-3">Booked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bookings.map((booking) => (
                    <tr key={booking.id}>
                      <td className="px-5 py-3 font-semibold">{booking.doctor_id}</td>
                      <td className="px-5 py-3 text-muted-foreground">{booking.kind}</td>
                      <td className="px-5 py-3 text-muted-foreground">{booking.slot}</td>
                      <td className="px-5 py-3 text-muted-foreground">{fmt(booking.created_at)}</td>
                    </tr>
                  ))}
                  {bookings.length === 0 && <Empty colSpan={4} label="No bookings yet." />}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

function Empty({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-12 text-center text-muted-foreground">
        {label}
      </td>
    </tr>
  )
}

function fmt(value: string | Date | null | undefined) {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
