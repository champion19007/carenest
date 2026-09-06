import Link from 'next/link'
import {
  AlertTriangle,
  CalendarClock,
  FileText,
  IndianRupee,
  MapPin,
  Pill,
  ShieldCheck,
  Video,
} from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { findDoctorBySlug, listBookingsForUser } from '@/lib/db/sql'
import { listChartNotes, listPrescriptions } from '@/lib/db/docs'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your account · CareNest', robots: { index: false } }

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ booked?: string; denied?: string }>
}) {
  const { booked, denied } = await searchParams
  const user = await requireUser('/account')

  const bookings = listBookingsForUser(user.id)
  const [prescriptions, notes] = await Promise.all([
    listPrescriptions(user.id),
    listChartNotes(user.id),
  ])

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />

      <div className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1100px] px-5 py-10 lg:px-8">
          <p className="eyebrow">Your account</p>
          <h1 className="mt-3 text-3xl sm:text-4xl">{user.name || `+91 ${user.phone}`}</h1>
          <p className="mt-2 text-muted-foreground">
            Member since{' '}
            {new Date(user.created_at).toLocaleDateString('en-IN', {
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] space-y-8 px-5 py-10 lg:px-8">
        {booked && (
          <p
            role="status"
            className="flex items-start gap-3 rounded-lg border border-success/40 bg-success/10 px-5 py-4 text-success"
          >
            <ShieldCheck className="mt-0.5 size-5 shrink-0" />
            <span>
              <strong>Appointment confirmed.</strong> The clinic can see your name on their calendar.
              In a live deployment you would also get an SMS and WhatsApp confirmation.
            </span>
          </p>
        )}

        {denied === 'practice' && (
          <p
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-5 py-4 text-warning"
          >
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <span>
              The clinic app is only for accounts registered as a doctor or clinic staff. If you run
              a practice,{' '}
              <Link href="/join" className="font-semibold underline">
                list it here
              </Link>
              .
            </span>
          </p>
        )}

        {/* Bookings ---------------------------------------------------- */}
        <section>
          <h2 className="text-2xl">Your appointments</h2>
          <p className="mt-2 text-muted-foreground">
            Every slot you have reserved. Cancel at least two hours ahead so it can be released to
            another patient.
          </p>

          <div className="mt-5 space-y-4">
            {bookings.map((booking) => {
              const doctor = findDoctorBySlug(booking.doctor_id)
              return (
                <article
                  key={booking.id}
                  className="flex flex-wrap items-center gap-5 rounded-xl border border-border bg-card p-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl">{doctor?.name ?? booking.doctor_id}</h3>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-bold ${
                          booking.status === 'confirmed'
                            ? 'bg-success/10 text-success'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {booking.status}
                      </span>
                      {booking.kind === 'video' && (
                        <span className="inline-flex items-center gap-1.5 rounded bg-soft px-2 py-0.5 text-xs font-bold text-primary">
                          <Video className="size-3" />
                          Video
                        </span>
                      )}
                    </div>
                    {doctor && (
                      <p className="mt-1 text-muted-foreground">{doctor.speciality}</p>
                    )}
                    <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
                      <CalendarClock className="size-4 text-primary" />
                      {booking.slot}
                    </p>
                    {doctor && (
                      <p className="mt-1 flex items-start gap-2 text-sm text-muted-foreground">
                        <MapPin className="mt-0.5 size-4 shrink-0" />
                        {doctor.clinic}, {doctor.locality}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <p className="inline-flex items-center text-lg font-bold">
                      <IndianRupee className="size-4" />
                      {booking.fee}
                    </p>
                    <p className="text-xs text-muted-foreground">payable at clinic</p>
                  </div>
                </article>
              )
            })}

            {bookings.length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-10 text-center">
                <p className="text-lg font-semibold">No appointments yet</p>
                <p className="mt-2 text-muted-foreground">
                  Find a doctor near you and reserve a slot — it takes about a minute.
                </p>
                <Link
                  href="/search"
                  className="mt-5 inline-flex min-h-12 items-center rounded-lg bg-cta px-6 font-semibold text-cta-foreground"
                >
                  Find a doctor
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Prescriptions ------------------------------------------------ */}
        <section>
          <h2 className="text-2xl">Prescriptions</h2>
          <p className="mt-2 text-muted-foreground">
            Issued by doctors you have seen through CareNest. Show these at any pharmacy.
          </p>

          <div className="mt-5 space-y-4">
            {prescriptions.map((item) => (
              <article key={item._id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="inline-flex items-center gap-2 text-lg">
                    <Pill className="size-4 text-primary" />
                    {item.doctorName}
                  </h3>
                  {item.createdAt && (
                    <span className="text-sm text-muted-foreground">
                      {new Date(item.createdAt).toLocaleDateString('en-IN')}
                    </span>
                  )}
                </div>
                <ul className="mt-3 space-y-2">
                  {item.drugs.map((drug) => (
                    <li key={drug.drug} className="text-[0.95rem]">
                      <span className="font-semibold">{drug.drug}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        — {drug.dose}, {drug.frequency}, {drug.intake}, {drug.days} days
                      </span>
                    </li>
                  ))}
                </ul>
                {item.advice && (
                  <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
                    {item.advice}
                  </p>
                )}
              </article>
            ))}

            {prescriptions.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
                No prescriptions yet. They appear here automatically after a consultation.
              </p>
            )}
          </div>
        </section>

        {/* Visit notes -------------------------------------------------- */}
        <section>
          <h2 className="text-2xl">Visit notes</h2>
          <p className="mt-2 text-muted-foreground">
            What the doctor recorded during your appointment.
          </p>

          <div className="mt-5 space-y-4">
            {notes.map((note) => (
              <article key={note._id} className="rounded-xl border border-border bg-card p-5">
                <h3 className="inline-flex items-center gap-2 text-lg">
                  <FileText className="size-4 text-primary" />
                  Consultation note
                  {note.createdAt && (
                    <span className="text-sm font-normal text-muted-foreground">
                      {new Date(note.createdAt).toLocaleDateString('en-IN')}
                    </span>
                  )}
                </h3>
                <dl className="mt-3 space-y-2 text-[0.95rem]">
                  {note.complaints && <Row label="Complaints" value={note.complaints} />}
                  {note.observations && <Row label="Observations" value={note.observations} />}
                  {note.diagnosis && <Row label="Diagnosis" value={note.diagnosis} />}
                </dl>
              </article>
            ))}

            {notes.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
                No visit notes yet.
              </p>
            )}
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-4">
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{value}</dd>
    </div>
  )
}
