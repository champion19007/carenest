import Link from 'next/link'
import { CalendarClock, IndianRupee, Inbox, Phone, Stethoscope, Users, Video } from 'lucide-react'
import { PracticeShell } from '@/components/practice-shell'
import { RequestActions } from '@/components/request-actions'
import { Avatar } from '@/components/avatar'
import { EmptyArt } from '@/components/empty-art'
import { requireRole } from '@/lib/auth'
import { findDoctorByUserId, requestsForDoctor } from '@/lib/db/sql'
import { referralsForDoctor } from '@/lib/db/leads'

export const metadata = { title: 'Requests · CareNest for clinics' }

function ageFrom(dob: string | null) {
  if (!dob) return null
  const born = new Date(dob)
  if (Number.isNaN(born.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  const m = now.getMonth() - born.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age--
  return age >= 0 && age < 130 ? age : null
}

export default async function RequestsPage() {
  const user = await requireRole('doctor', '/practice/requests')
  const doctor = await findDoctorByUserId(user.id)

  if (!doctor) {
    return (
      <PracticeShell>
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <EmptyArt />
          <p className="mt-6 text-lg font-semibold">Your clinician profile is not set up yet</p>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">
            Your account is marked as a clinician, but it is not linked to a listed practice, so
            there is nothing for patients to book. An administrator completes this link once your
            registration has been checked.
          </p>
        </div>
      </PracticeShell>
    )
  }

  const [requests, referrals] = await Promise.all([
    requestsForDoctor(doctor.id),
    referralsForDoctor(doctor.id),
  ])

  const pending = requests.filter((r) => r.status === 'requested')
  const answered = requests.filter((r) => r.status !== 'requested')

  return (
    <PracticeShell>
      <div className="space-y-8">
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">
              Waiting for you
              {pending.length > 0 && (
                <span className="ml-2 rounded-full bg-cta px-2.5 py-0.5 text-sm text-cta-foreground">
                  {pending.length}
                </span>
              )}
            </h2>
            <p className="text-sm text-muted-foreground">
              Showing requests for {doctor.name}
            </p>
          </div>

          {pending.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-border p-10 text-center">
              <Inbox className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-4 font-semibold">No one is waiting</p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                New appointment requests appear here as patients send them.
              </p>
            </div>
          ) : (
            <ul className="mt-5 space-y-4">
              {pending.map((request) => (
                <li key={request.id} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                    <Avatar
                      name={request.seen_for ?? request.patient_name}
                      speciality={request.seen_for_relation ?? 'Self'}
                      size={52}
                    />

                    <div className="min-w-0 flex-1">
                      <p className="font-bold">
                        {request.seen_for ?? request.patient_name}
                        {ageFrom(request.seen_for_dob) !== null && (
                          <span className="font-normal text-muted-foreground">
                            {' '}
                            · {ageFrom(request.seen_for_dob)} yrs
                          </span>
                        )}
                      </p>

                      {/* When one person books for another, the clinic needs
                          both names: who is being seen, and who to call. */}
                      {request.seen_for && (
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Users className="size-3.5" />
                          Booked by {request.patient_name} ({request.seen_for_relation})
                        </p>
                      )}

                      <p className="mt-2 flex items-center gap-2 text-sm">
                        {request.kind === 'video' ? (
                          <Video className="size-4 text-primary" />
                        ) : (
                          <CalendarClock className="size-4 text-primary" />
                        )}
                        {request.slot}
                        <span className="text-muted-foreground">
                          · {request.kind === 'video' ? 'Video consult' : 'Clinic visit'}
                        </span>
                      </p>

                      {request.patient_phone && (
                        <p className="mt-1 flex items-center gap-2 text-sm">
                          <Phone className="size-4 text-primary" />
                          +91 {request.patient_phone}
                        </p>
                      )}

                      <p className="mt-1 flex items-center gap-1 text-sm font-semibold">
                        <IndianRupee className="size-3.5 text-primary" />
                        {request.fee}
                      </p>
                    </div>

                    <RequestActions bookingId={request.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {referrals.length > 0 && (
          <section>
            <h2 className="text-xl font-bold">Surgery referrals</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Enquiries an administrator has checked and passed to you.
            </p>
            <ul className="mt-5 space-y-4">
              {referrals.map((referral) => (
                <li key={referral.id} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-start gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-soft text-primary">
                      <Stethoscope className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold">{referral.lead_name}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {referral.procedure || 'Procedure not specified'}
                        {referral.city && ` · ${referral.city}`}
                      </p>
                      {referral.notes && (
                        <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm leading-6">
                          {referral.notes}
                        </p>
                      )}
                      <p className="mt-2 flex items-center gap-2 text-sm">
                        <Phone className="size-4 text-primary" />
                        +91 {referral.lead_phone}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {answered.length > 0 && (
          <section>
            <h2 className="text-xl font-bold">Already answered</h2>
            <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
              {answered.slice(0, 12).map((request) => (
                <li key={request.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {request.seen_for ?? request.patient_name}
                  </span>
                  <span className="text-sm text-muted-foreground">{request.slot}</span>
                  <span
                    className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                      request.status === 'confirmed'
                        ? 'bg-success/10 text-success'
                        : 'bg-warning/10 text-warning'
                    }`}
                  >
                    {request.status === 'confirmed' ? 'Confirmed' : 'Declined'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-sm text-muted-foreground">
          Looking for your full patient list?{' '}
          <Link href="/practice/patients" className="font-semibold text-primary hover:underline">
            Open the practice
          </Link>
        </p>
      </div>
    </PracticeShell>
  )
}
