import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  BadgeCheck,
  CalendarClock,
  IndianRupee,
  Languages as LanguagesIcon,
  MapPin,
  Star,
  Stethoscope,
  Video,
} from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { ReviewList } from '@/components/review-list'
import { findDoctorBySlug, searchDoctors } from '@/lib/db/sql'
import { listReviews } from '@/lib/db/docs'
import { currentUser } from '@/lib/auth'

/** Public and indexable — this is how patients arrive from a search engine. */
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const doctor = await findDoctorBySlug(slug)
  if (!doctor) return { title: 'Doctor not found · CareNest' }

  const title = `${doctor.name} — ${doctor.speciality} in ${doctor.locality}, ${doctor.city}`
  return {
    title: `${title} · CareNest`,
    description: `Book an appointment with ${doctor.name}, ${doctor.qualification}. ${doctor.experience} years experience. Consultation fee ₹${doctor.fee}. ${doctor.about}`,
    alternates: { canonical: `/doctor/${doctor.slug}` },
    openGraph: { title, description: doctor.about, type: 'profile' },
  }
}

/** Serialises JSON-LD so it cannot terminate the surrounding script tag. */
function safeJsonLd(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\u003c')
    .replace(/>/g, '\u003e')
    .replace(/&/g, '\u0026')
}

export default async function DoctorProfile({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const doctor = await findDoctorBySlug(slug)
  if (!doctor) notFound()

  const [reviews, user] = await Promise.all([await listReviews(doctor.slug), currentUser()])
  const similarAll = await searchDoctors({
    kind: doctor.kind as 'human' | 'vet',
    specialities: [doctor.speciality],
  })
  const similar = similarAll.filter((item) => item.slug !== doctor.slug).slice(0, 3)

  /* Structured data so search engines can render a rich result. */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Physician',
    name: doctor.name,
    medicalSpecialty: doctor.speciality,
    description: doctor.about,
    address: {
      '@type': 'PostalAddress',
      addressLocality: doctor.locality,
      addressRegion: doctor.city,
      addressCountry: 'IN',
    },
    ...(doctor.reviews_count > 0 && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: doctor.rating,
        reviewCount: doctor.reviews_count,
      },
    }),
  }

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />
      <script
        type="application/ld+json"
        // JSON.stringify does not escape "<", so a value containing
        // "</script>" would close this tag early. Doctors supply their own
        // names during onboarding, so escape before embedding.
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />

      <div className="mx-auto max-w-[1320px] px-5 py-8 lg:px-8">
        <nav aria-label="Breadcrumb" className="text-sm">
          <ol className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <li>
              <Link href="/" className="hover:underline">
                Home
              </Link>
            </li>
            <li aria-hidden="true">›</li>
            <li>
              <Link href="/search" className="hover:underline">
                Doctors
              </Link>
            </li>
            <li aria-hidden="true">›</li>
            <li className="text-foreground">{doctor.name}</li>
          </ol>
        </nav>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_22rem]">
          <div className="min-w-0 space-y-6">
            <section className="rounded-xl border border-border bg-card p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <span className="flex size-24 shrink-0 items-center justify-center rounded-2xl bg-soft text-3xl font-bold text-primary">
                  {doctor.name
                    .replace(/^Dr\.?\s*/i, '')
                    .split(' ')
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join('')}
                </span>
                <div className="min-w-0">
                  <h1 className="flex flex-wrap items-center gap-2 text-3xl">
                    {doctor.name}
                    <BadgeCheck className="size-6 text-primary" aria-label="Registration verified" />
                  </h1>
                  <p className="mt-1 text-lg text-muted-foreground">{doctor.speciality}</p>
                  <p className="mt-1 text-muted-foreground">{doctor.qualification}</p>
                  <p className="mt-1 font-semibold">{doctor.experience} years experience</p>

                  <div className="mt-4 flex flex-wrap gap-2 text-sm">
                    {doctor.reviews_count > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-accent/15 px-2.5 py-1 font-semibold text-warning">
                        <Star className="size-3.5 fill-current" />
                        {doctor.rating.toFixed(1)} · {doctor.reviews_count} reviews
                      </span>
                    )}
                    {doctor.video && (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-soft px-2.5 py-1 font-semibold text-primary">
                        <Video className="size-3.5" />
                        Video consult
                      </span>
                    )}
                    {doctor.cashless && (
                      <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 font-semibold">
                        Cashless available
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-2xl">About {doctor.name.replace(/^Dr\.?\s*/i, '')}</h2>
              <p className="mt-3 leading-8 text-muted-foreground">{doctor.about}</p>

              <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <dt className="font-semibold">{doctor.clinic}</dt>
                    <dd className="text-muted-foreground">
                      {doctor.locality}, {doctor.city}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <LanguagesIcon className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <dt className="font-semibold">Speaks</dt>
                    <dd className="text-muted-foreground">
                      {doctor.languages.split(',').join(', ')}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <IndianRupee className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <dt className="font-semibold">₹{doctor.fee} consultation fee</dt>
                    <dd className="text-muted-foreground">
                      Tests, procedures and medicines are billed separately.
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Stethoscope className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <dt className="font-semibold">Registration</dt>
                    <dd className="text-muted-foreground">
                      {doctor.registration_no} · {doctor.council}
                    </dd>
                  </div>
                </div>
              </dl>
            </section>

            <ReviewList
              doctorSlug={doctor.slug}
              doctorName={doctor.name}
              reviews={reviews}
              canReview={Boolean(user)}
            />

            {similar.length > 0 && (
              <section className="rounded-xl border border-border bg-card p-6">
                <h2 className="text-2xl">Other {doctor.speciality}s nearby</h2>
                <ul className="mt-4 divide-y divide-border">
                  {similar.map((item) => (
                    <li key={item.slug} className="flex flex-wrap items-center gap-4 py-4">
                      <div className="min-w-0 flex-1">
                        <Link href={`/doctor/${item.slug}`} className="font-semibold hover:underline">
                          {item.name}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {item.experience} yrs · {item.locality} · ₹{item.fee}
                        </p>
                      </div>
                      <Link
                        href={`/book/${item.slug}`}
                        className="inline-flex min-h-10 items-center rounded-lg border border-border px-4 text-sm font-semibold hover:border-primary"
                      >
                        Book
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-xl border border-border bg-card p-6">
              <p className="inline-flex items-center gap-2 font-semibold text-success">
                <CalendarClock className="size-4" />
                Next available · {doctor.next_slot}
              </p>
              <p className="mt-4 inline-flex items-baseline gap-2">
                <span className="inline-flex items-center text-3xl font-bold">
                  <IndianRupee className="size-6" />
                  {doctor.fee}
                </span>
                <span className="text-sm text-muted-foreground">consultation</span>
              </p>

              <Link
                href={`/book/${doctor.slug}`}
                className="mt-6 inline-flex min-h-13 w-full items-center justify-center rounded-lg bg-cta font-semibold text-cta-foreground transition-opacity hover:opacity-90"
              >
                Book appointment
              </Link>

              <p className="mt-4 text-center text-sm text-muted-foreground">
                {user
                  ? 'No booking fee. Pay the clinic directly.'
                  : 'You will be asked to sign in to confirm the slot.'}
              </p>
            </div>
          </aside>
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
