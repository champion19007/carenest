import Link from 'next/link'
import {
  BarChart3,
  Building2,
  CalendarCheck,
  Check,
  FileLock2,
  Lock,
  ServerCog,
  Stethoscope,
  Users,
} from 'lucide-react'
import { Photo } from '@/components/photo'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { photos } from '@/lib/images'
import { hospitalGroups } from '@/lib/data'

const scale = [
  { value: '3 crore+', label: 'Patients reached' },
  { value: '38,000+', label: 'Verified doctors' },
  { value: '9,000+', label: 'Clinics & hospitals' },
  { value: '120+', label: 'Cities' },
]

const audiences = [
  {
    Icon: Stethoscope,
    title: 'For doctors',
    lede: 'Build your digital presence and fill your calendar.',
    points: [
      'A free, verified profile that ranks when patients search your locality',
      'Paid online consultations with digital prescriptions',
      'Publish health articles to reach patients before they book',
    ],
    cta: 'Get your free profile',
  },
  {
    Icon: CalendarCheck,
    title: 'For clinics',
    lede: 'Practice management that front-desk staff can actually run.',
    points: [
      'Appointment calendar with SMS and WhatsApp reminders',
      'Digital patient records, billing and inventory in one place',
      'Instant online booking for patients who find you on CareNest',
    ],
    cta: 'See clinic software',
  },
  {
    Icon: Building2,
    title: 'For hospitals',
    lede: 'Hospital information systems built for Indian workflows.',
    points: [
      'Multi-department OPD, IPD and pharmacy modules',
      'Business intelligence across admissions, revenue and occupancy',
      'TPA and insurance desk workflows for cashless claims',
    ],
    cta: 'Talk to our team',
  },
]

const dataPromises = [
  'Your patient data belongs to your practice, not to us',
  'We never sell or share records with third parties',
  'We do not market to your walk-in patients',
  'One practice can never see another practice’s data',
  'You decide what communication goes to your patients',
  'Access is logged and auditable',
]

const certifications = [
  { Icon: Lock, title: '256-bit encryption', body: 'In transit and at rest' },
  { Icon: FileLock2, title: 'ISO 27001', body: 'Information security certified' },
  { Icon: ServerCog, title: 'India data centres', body: 'Records stored in-country' },
]

export default function ForProvidersPage() {
  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />

      {/* ABDM hero ------------------------------------------------------ */}
      <section className="bg-banner text-banner-foreground">
        <div className="mx-auto max-w-[1320px] px-5 py-14 lg:px-8">
          <p className="text-lg font-semibold text-banner-muted">CareNest is now</p>
          <h1 className="mt-2 max-w-4xl text-balance text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">
            Ayushman Bharat Digital Mission (ABDM) compliant
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-banner-muted">
            ABDM builds the digital backbone that links patients, doctors and hospitals across
            India. CareNest practices can issue and link ABHA numbers, so a patient&apos;s records
            follow them between providers.
          </p>

          <dl className="mt-10 grid grid-cols-2 gap-6 lg:grid-cols-4">
            {scale.map(({ value, label }) => (
              <div key={label}>
                <dt className="text-3xl font-extrabold">{value}</dt>
                <dd className="mt-1 text-sm text-banner-muted">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Audiences ------------------------------------------------------ */}
      <section className="mx-auto max-w-[1320px] px-5 py-14 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[0.85fr_1fr]">
          {/* Clinicians are the audience here, so the page shows the work
              rather than the patient-facing product. */}
          <div className="grid grid-cols-2 gap-4">
            <Photo
              photo={photos.providerStethoscope}
              ratio={3 / 4}
              width={380}
              className="rounded-2xl shadow-lg"
            />
            <Photo
              photo={photos.teleconsult}
              ratio={3 / 4}
              width={380}
              className="mt-8 rounded-2xl shadow-lg"
            />
          </div>
          <div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">What we build</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Whether you run a single-doctor clinic in a tier-2 city or a multi-speciality hospital
              group, the tools are the same underneath.
            </p>
          </div>
        </div>

        <div className="mt-9 grid gap-6 lg:grid-cols-3">
          {audiences.map(({ Icon, title, lede, points, cta }) => (
            <article key={title} className="flex flex-col rounded-xl border border-border bg-card p-6">
              <span className="flex size-12 items-center justify-center rounded-xl bg-soft text-primary">
                <Icon className="size-6" />
              </span>
              <h3 className="mt-5 text-xl font-bold">{title}</h3>
              <p className="mt-2 text-muted-foreground">{lede}</p>
              <ul className="mt-5 flex-1 space-y-3">
                {points.map((point) => (
                  <li key={point} className="flex gap-2.5 text-[0.95rem] leading-6">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    {point}
                  </li>
                ))}
              </ul>
              <Link
                href="/join"
                className="mt-6 inline-flex min-h-12 items-center justify-center rounded-lg bg-cta font-semibold text-cta-foreground transition-opacity hover:opacity-90"
              >
                {cta}
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* Data ownership ------------------------------------------------- */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-[1320px] px-5 py-14 lg:px-8">
          <h2 className="text-2xl font-extrabold sm:text-3xl">Your data has one owner — you</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Practices trust us with the most sensitive records they hold. These are commitments, not
            settings you have to find.
          </p>

          <ul className="mt-8 grid gap-x-10 gap-y-4 sm:grid-cols-2">
            {dataPromises.map((promise) => (
              <li key={promise} className="flex gap-3 text-[1.05rem]">
                <Check className="mt-1 size-5 shrink-0 text-success" />
                {promise}
              </li>
            ))}
          </ul>

          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {certifications.map(({ Icon, title, body }) => (
              <div key={title} className="rounded-xl border border-border bg-card p-5 text-center">
                <Icon className="mx-auto size-7 text-primary" />
                <p className="mt-4 font-bold">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Partners + analytics ------------------------------------------- */}
      <section className="mx-auto max-w-[1320px] px-5 py-14 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <span className="flex size-12 items-center justify-center rounded-xl bg-soft text-primary">
              <BarChart3 className="size-6" />
            </span>
            <h2 className="mt-5 text-2xl font-extrabold sm:text-3xl">
              See how your practice is really doing
            </h2>
            <p className="mt-3 leading-8 text-muted-foreground">
              Track new versus repeat patients, no-show rates, revenue per department and peak OPD
              hours — so you can staff and schedule around what actually happens.
            </p>
            <Link
              href="/practice/reports"
              className="mt-6 inline-flex min-h-12 items-center rounded-lg border border-primary px-6 font-semibold text-primary transition-colors hover:bg-soft"
            >
              Explore the dashboard
            </Link>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2">
              <Users className="size-5 text-primary" />
              <h3 className="font-bold">Partner hospital groups</h3>
            </div>
            <ul className="mt-5 space-y-3">
              {hospitalGroups.map((group) => (
                <li
                  key={group}
                  className="rounded-lg border border-border px-4 py-3 font-semibold text-foreground/75"
                >
                  {group}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
