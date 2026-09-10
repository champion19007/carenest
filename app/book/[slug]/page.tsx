import Link from 'next/link'
import { notFound } from 'next/navigation'
import { IndianRupee, MapPin, ShieldCheck } from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { BookingForm } from '@/components/booking-form'
import { ensureSelfMember, listFamily } from '@/lib/db/family'
import { findDoctorBySlug } from '@/lib/db/sql'
import { ensureSlots, openSlots } from '@/lib/db/slots'
import { requireUser, newId } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Confirm your appointment · CareNest', robots: { index: false } }

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const doctor = await findDoctorBySlug(slug)
  if (!doctor) notFound()

  /* Booking is the point where an account becomes necessary. */
  const user = await requireUser(`/book/${slug}`)
  await ensureSelfMember(user.id, user.name, newId('fam'))
  const family = await listFamily(user.id)

  /* Generate the clinic's next few days of slots if they are not there yet,
     then read back only the ones still free. Idempotent, so opening the page
     twice does not duplicate a calendar. */
  await ensureSlots(doctor.id)
  const slots = (await openSlots(doctor.id)).map((slot) => ({
    slotId: slot.slot_id,
    startsAt: slot.slot_start,
  }))

  return (
    <main className="min-h-screen bg-surface">
      <SiteHeader />

      <div className="mx-auto max-w-[900px] px-5 py-10 lg:px-8">
        <Link href={`/doctor/${doctor.slug}`} className="text-sm font-semibold text-primary hover:underline">
          ← Back to {doctor.name}
        </Link>

        <h1 className="mt-5 text-3xl sm:text-4xl">Confirm your appointment</h1>
        <p className="mt-3 max-w-2xl leading-8 text-muted-foreground">
          Pick a time that suits you. The slot is held against your account, and the clinic sees
          your name on their calendar — so nobody else can take it.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_18rem]">
          <BookingForm
            slug={doctor.slug}
            doctorName={doctor.name}
            offersVideo={doctor.video}
            patientName={user.name || `+91 ${user.phone}`}
            family={family}
            slots={slots}
          />

          <aside className="h-fit rounded-xl border border-border bg-card p-6">
            <h2 className="text-xl">{doctor.name}</h2>
            <p className="mt-1 text-muted-foreground">{doctor.speciality}</p>
            <p className="mt-1 text-sm text-muted-foreground">{doctor.qualification}</p>

            <p className="mt-5 flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                {doctor.clinic}
                <br />
                {doctor.locality}, {doctor.city}
              </span>
            </p>

            <p className="mt-5 inline-flex items-center gap-2 border-t border-border pt-5 text-lg font-bold">
              <IndianRupee className="size-5" />
              {doctor.fee}
              <span className="text-sm font-normal text-muted-foreground">consultation fee</span>
            </p>

            <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
              Pay the clinic directly by UPI, card or cash. CareNest takes no booking fee and does
              not hold your card details.
            </p>
          </aside>
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
