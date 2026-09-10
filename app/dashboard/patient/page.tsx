import Link from 'next/link'
import {
  CalendarClock,
  FileText,
  FlaskConical,
  IndianRupee,
  MapPin,
  Users,
} from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { HealthChecklist } from '@/components/health-checklist'
import { FamilyManager } from '@/components/family-manager'
import { LiveQueue } from '@/components/live-queue'
import { Avatar } from '@/components/avatar'
import { requireUser, newId } from '@/lib/auth'
import { ensureSelfMember, listFamily } from '@/lib/db/family'
import { bookingsForDashboard } from '@/lib/db/sql'
import { listPrescriptions } from '@/lib/db/docs'

export const metadata = { title: 'Your health · CareNest' }

export default async function PatientHome() {
  const user = await requireUser('/dashboard/patient')

  await ensureSelfMember(user.id, user.name, newId('fam'))
  const [family, bookings, scripts] = await Promise.all([
    listFamily(user.id),
    bookingsForDashboard(user.id),
    listPrescriptions(user.id),
  ])

  const upcoming = bookings.filter((b) => b.status === 'confirmed')
  const next = upcoming[0]

  /* The greeting uses the name on the account. Every account had one to show
     as of the name step at sign-in; before that the page said "Aarav" to
     everyone. */
  const firstName = user.name.split(' ')[0] || 'there'

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />

      <div className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1320px] px-5 py-10 lg:px-8">
          <h1 className="text-3xl font-extrabold sm:text-4xl">Namaste, {firstName} 👋</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            {upcoming.length > 0
              ? "Here's what needs your attention today."
              : 'Nothing booked at the moment. Search for a doctor when you need one.'}
          </p>

          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { Icon: CalendarClock, label: 'Upcoming visits', value: upcoming.length },
              { Icon: FileText, label: 'Prescriptions', value: scripts.length },
              { Icon: FlaskConical, label: 'Lab reports', value: 0 },
              { Icon: Users, label: 'Family members', value: family.length },
            ].map(({ Icon, label, value }) => (
              <div key={label} className="rounded-xl border border-border bg-card p-5">
                <Icon className="size-5 text-primary" />
                <p className="mt-4 text-2xl font-extrabold">{value}</p>
                <p className="text-sm text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1320px] gap-8 px-5 py-10 lg:grid-cols-[1.5fr_1fr] lg:px-8">
        <div className="space-y-8">
          <section className="rounded-xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Next appointment</h2>
              {next && (
                <span className="rounded-md bg-success/10 px-2.5 py-1 text-sm font-bold text-success">
                  Confirmed
                </span>
              )}
            </div>

            {next ? (
              <>
                <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
                  <Avatar name={next.doctor_name} speciality={next.speciality} size={64} />
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-bold">{next.doctor_name}</p>
                    <p className="text-muted-foreground">{next.speciality}</p>

                    {/* Who the visit is for. Without this a booking a daughter
                        made for her father shows up under her own name at the
                        reception desk. */}
                    {next.seen_for && (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-soft px-2.5 py-1 text-sm font-semibold text-primary">
                        <Users className="size-3.5" />
                        For {next.seen_for}
                      </p>
                    )}

                    <p className="mt-2 flex items-center gap-2 text-sm">
                      <CalendarClock className="size-4 text-primary" />
                      {next.slot}
                    </p>
                    <p className="mt-1 flex items-start gap-2 text-sm">
                      <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                      {next.clinic}
                      {next.locality && `, ${next.locality}`}
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-sm font-semibold">
                      <IndianRupee className="size-4 text-primary" />
                      {next.fee} payable at clinic
                    </p>
                  </div>
                </div>

                {/* Renders nothing unless there is a queue to report, so a
                    booking for next week does not show an empty panel. */}
                <LiveQueue bookingId={next.id} />

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href={`/doctor/${next.doctor_slug}`}
                    className="inline-flex min-h-11 items-center rounded-lg bg-cta px-5 font-semibold text-cta-foreground"
                  >
                    View doctor
                  </Link>
                  <Link
                    href="/account"
                    className="inline-flex min-h-11 items-center rounded-lg border border-border px-5 font-semibold hover:border-primary"
                  >
                    All bookings
                  </Link>
                </div>
              </>
            ) : (
              <div className="mt-5 rounded-lg border border-dashed border-border px-5 py-8 text-center">
                <p className="font-semibold">You have no upcoming appointments</p>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Search by symptom or speciality and book a real slot.
                </p>
                <Link
                  href="/search"
                  className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-cta px-6 font-semibold text-cta-foreground"
                >
                  Find a doctor
                </Link>
              </div>
            )}
          </section>

          <HealthChecklist />
        </div>

        {/* Right rail */}
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-xl font-bold">Family members</h2>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              People you book for. Their name and age travel with the appointment.
            </p>
            <div className="mt-5">
              <FamilyManager members={family} />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-xl font-bold">Health insurance</h2>
            <p className="mt-2 text-muted-foreground">
              Add your policy to check cashless eligibility before booking.
            </p>
            <div className="mt-5 space-y-3">
              {['Health policy', 'Ayushman Bharat card'].map((kind) => (
                <div
                  key={kind}
                  className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border px-4 py-3"
                >
                  <span className="font-semibold">{kind}</span>
                  <span className="text-sm text-muted-foreground">Not added</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
