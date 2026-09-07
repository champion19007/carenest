import Link from 'next/link'
import {
  ArrowRight,
  BadgeCheck,
  Check,
  IndianRupee,
  Lock,
  Phone,
} from 'lucide-react'
import { Disclosure } from '@/components/disclosure'
import { Photo } from '@/components/photo'
import { serviceArt } from '@/components/service-art'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { faqs, glossary, services, trustPoints } from '@/lib/content'
import { photos } from '@/lib/images'
import { cities, healthConcerns, insurers } from '@/lib/data'

const steps = [
  {
    n: '01',
    title: 'Tell us what is wrong',
    body: 'Search by a symptom in plain words — “chest pain”, “skin rash”, “child not eating” — or by speciality if you already know who you need. Set your locality so results are places you can actually reach.',
  },
  {
    n: '02',
    title: 'Compare before you commit',
    body: 'Every doctor shows their qualification, years of practice, consultation fee, languages spoken, and reviews from patients who actually attended. Nothing is hidden until the reception desk.',
  },
  {
    n: '03',
    title: 'Book a real slot',
    body: 'You pick a specific time from the clinic’s live calendar and get an SMS and WhatsApp confirmation with the address — not a token number and an open-ended wait.',
  },
  {
    n: '04',
    title: 'Keep everything afterwards',
    body: 'Prescriptions and lab reports land in your account. Bring them to the next visit, share them with another doctor, or link an ABHA number so they follow you automatically.',
  },
]

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero ----------------------------------------------------------- */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1320px] px-5 py-16 lg:px-8 lg:py-24">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="eyebrow">Healthcare booking · India</p>
            <h1 className="mt-6 text-balance text-5xl leading-[1.05] sm:text-6xl lg:text-[4.5rem]">
              Find the right doctor,
              <br />
              <span className="text-primary">and know the price first</span>
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-9 text-muted-foreground">
              CareNest is a booking platform for clinic visits, video consultations, lab tests at
              home, planned surgery and veterinary care. We are not a hospital — the doctors and
              clinics are independent. What we do is verify that they are registered, show you their
              real availability and fees, and hold your slot.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/sign-up"
                className="inline-flex min-h-14 items-center gap-3 rounded-lg bg-cta px-8 font-semibold text-cta-foreground transition-opacity hover:opacity-90"
              >
                Create a free account <ArrowRight className="size-4" />
              </Link>
              <Link
                href="#what-we-do"
                className="inline-flex min-h-14 items-center rounded-lg border border-foreground/25 px-8 font-semibold transition-colors hover:bg-muted"
              >
                See how it works
              </Link>
            </div>

            <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="size-4 shrink-0" />
              Free to join. No booking fee — you pay the clinic directly for care.
            </p>
          </div>

            {/* The photograph carries the warmth the copy deliberately does
                not: the text stays plain about what we are and are not. */}
            <div className="relative">
              <Photo
                photo={photos.heroConsult}
                ratio={4 / 5}
                width={720}
                priority
                className="rounded-2xl shadow-xl"
              />
              <div className="absolute -bottom-8 -left-6 hidden w-48 sm:block lg:-left-10 lg:w-56">
                <Photo
                  photo={photos.clinicianPhone}
                  ratio={1}
                  width={320}
                  scrim="none"
                  className="rounded-2xl border-4 border-background shadow-lg"
                />
              </div>
              <div className="absolute -right-4 -top-5 hidden rounded-xl border border-border bg-card px-4 py-3 shadow-lg sm:block">
                <p className="text-xs text-muted-foreground">Average wait after booking</p>
                <p className="font-display text-2xl font-semibold text-accent">12 min</p>
              </div>
            </div>
          </div>

          <dl className="mt-16 grid gap-8 border-t border-border pt-10 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['38,000+', 'Registered doctors, each checked against the medical council register'],
              ['120+', 'Cities, from metros to tier-2 towns'],
              ['₹0', 'Booking fee — we charge you nothing to reserve a slot'],
              ['24 hrs', 'Typical turnaround for a home lab report'],
            ].map(([value, label]) => (
              <div key={value}>
                <dt className="font-display text-3xl font-semibold text-accent">{value}</dt>
                <dd className="mt-2 text-sm leading-6 text-muted-foreground">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* What we do ----------------------------------------------------- */}
      <section id="what-we-do" className="mx-auto max-w-[1320px] px-5 py-20 lg:px-8">
        <div className="max-w-3xl">
          <p className="eyebrow">What we do</p>
          <h2 className="gold-rule mt-4 text-4xl sm:text-5xl">Five things you can book</h2>
          <p className="mt-8 text-lg leading-9 text-muted-foreground">
            Each of these solves a different problem, and they work differently. Here is what each
            one actually is, when it is the right choice, and what it costs.
          </p>
        </div>

        <div className="mt-14 space-y-6">
          {services.map((service) => {
            const Art = serviceArt[service.slug] ?? serviceArt.doctors
            return (
              <article
                key={service.slug}
                className="grid gap-8 border border-border bg-card p-7 lg:grid-cols-[1fr_1.4fr] lg:p-10"
              >
                <div>
                  <div className="w-40">
                    <Art />
                  </div>
                  <h3 className="mt-6 text-3xl">{service.name}</h3>
                  <p className="mt-3 text-lg text-accent">{service.oneLine}</p>
                  <p className="mt-6 inline-flex items-baseline gap-1.5 text-sm text-muted-foreground">
                    Starts from
                    <span className="inline-flex items-center text-xl font-bold text-foreground">
                      <IndianRupee className="size-4" />
                      {service.from.toLocaleString('en-IN')}
                    </span>
                  </p>
                  <Link
                    href={service.href}
                    className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-lg border border-foreground/25 px-6 font-semibold transition-colors hover:bg-muted"
                  >
                    Browse <ArrowRight className="size-3.5" />
                  </Link>
                </div>

                <div className="space-y-6">
                  <div>
                    <p className="eyebrow">What it is</p>
                    <p className="mt-2 leading-8 text-muted-foreground">{service.what}</p>
                  </div>
                  <div>
                    <p className="eyebrow">When to choose it</p>
                    <p className="mt-2 leading-8 text-muted-foreground">{service.why}</p>
                  </div>
                  <div>
                    <p className="eyebrow">How it works</p>
                    <ul className="mt-3 space-y-2.5">
                      {service.how.map((line) => (
                        <li key={line} className="flex gap-3 leading-7">
                          <Check className="mt-1.5 size-4 shrink-0 text-accent" />
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {/* How booking works ---------------------------------------------- */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-[1320px] px-5 py-20 lg:px-8">
          <div className="max-w-3xl">
            <p className="eyebrow">The process</p>
            <h2 className="gold-rule mt-4 text-4xl sm:text-5xl">From symptom to prescription</h2>
          </div>

          <ol className="mt-14 grid gap-10 md:grid-cols-2">
            {steps.map(({ n, title, body }) => (
              <li key={n} className="border-t border-border pt-6">
                <span className="font-display text-4xl text-accent">{n}</span>
                <h3 className="mt-4 text-2xl">{title}</h3>
                <p className="mt-3 leading-8 text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Why trust us ---------------------------------------------------- */}
      <section className="mx-auto max-w-[1320px] px-5 py-20 lg:px-8">
        <div className="max-w-3xl">
          <p className="eyebrow">Why trust this</p>
          <h2 className="gold-rule mt-4 text-4xl sm:text-5xl">
            The parts people usually get burned on
          </h2>
        </div>

        <div className="mt-14 grid gap-8 sm:grid-cols-2">
          {trustPoints.map(({ title, body }) => (
            <div key={title} className="border-l-2 border-accent pl-6">
              <h3 className="text-2xl">{title}</h3>
              <p className="mt-3 leading-8 text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Glossary -------------------------------------------------------- */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-[1320px] px-5 py-20 lg:px-8">
          <div className="max-w-3xl">
            <p className="eyebrow">Plain English</p>
            <h2 className="gold-rule mt-4 text-4xl sm:text-5xl">What these words mean</h2>
            <p className="mt-8 text-lg leading-9 text-muted-foreground">
              Healthcare and insurance are full of jargon that nobody explains. If a term on this
              site is unfamiliar, it is defined here.
            </p>
          </div>

          <dl className="mt-14 grid gap-x-12 gap-y-8 md:grid-cols-2">
            {glossary.map(({ term, plain }) => (
              <div key={term} className="border-t border-border pt-5">
                <dt className="text-xl font-semibold text-accent">{term}</dt>
                <dd className="mt-2 leading-8 text-muted-foreground">{plain}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Insurance ------------------------------------------------------- */}
      <section className="mx-auto max-w-[1320px] px-5 py-20 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="eyebrow">Insurance</p>
            <h2 className="mt-4 text-4xl">Using your health cover</h2>
            <p className="mt-6 leading-9 text-muted-foreground">
              If a clinic is empanelled with your insurer, you can go cashless — the insurer settles
              with the hospital and you do not pay upfront. Add your policy once and we check
              eligibility before you confirm a booking, so you are not turned away at the desk.
            </p>
            <p className="mt-4 leading-9 text-muted-foreground">
              Bring your policy card and a photo ID. Approval is granted by the insurer, not by us —
              we can prepare the paperwork but we cannot guarantee the outcome.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {insurers.map(({ name, tint }) => (
              <div
                key={name}
                className="flex h-24 items-center justify-center border border-border bg-card px-4 text-center"
              >
                <span className="text-sm font-bold leading-tight" style={{ color: tint }}>
                  {name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ ------------------------------------------------------------- */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-[900px] px-5 py-20 lg:px-8">
          <p className="eyebrow">Questions</p>
          <h2 className="gold-rule mt-4 text-4xl sm:text-5xl">Before you sign up</h2>

          <dl className="mt-12 divide-y divide-border border-t border-border">
            {faqs.map(({ q, a }) => (
              <div key={q} className="py-7">
                <dt className="font-display text-2xl">{q}</dt>
                <dd className="mt-3 leading-9 text-muted-foreground">{a}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-12 flex flex-wrap items-center gap-4 border border-accent/40 bg-card p-7">
            <Phone className="size-6 shrink-0 text-accent" />
            <p className="min-w-0 flex-1 leading-7">
              <strong>In an emergency, do not book online.</strong> Call 108 for an ambulance or go
              to the nearest hospital emergency department.
            </p>
          </div>
        </div>
      </section>

      {/* Concerns + cities ---------------------------------------------- */}
      <section className="mx-auto max-w-[1320px] px-5 py-20 lg:px-8">
        <div className="grid gap-16 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Common concerns</p>
            <h2 className="mt-4 text-3xl">Not sure who to see?</h2>
            <p className="mt-4 leading-8 text-muted-foreground">
              Pick the thing that sounds closest to your problem and we will show you the right
              speciality.
            </p>
            <div className="mt-8">
              {Object.entries(healthConcerns).map(([group, items]) => (
                <Disclosure key={group} label={group} items={items} />
              ))}
            </div>
          </div>

          <div>
            <p className="eyebrow">Where we operate</p>
            <h2 className="mt-4 text-3xl">Cities we cover</h2>
            <p className="mt-4 leading-8 text-muted-foreground">
              Coverage is deepest in the metros. In smaller cities the doctor list is shorter, but
              every listing is verified the same way.
            </p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              {cities.map((city) => (
                <Link
                  key={city}
                  href="/search"
                  className="border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
                >
                  {city}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA ----------------------------------------------------- */}
      <section className="bg-banner text-banner-foreground">
        <div className="mx-auto max-w-[1320px] px-5 py-20 text-center lg:px-8">
          <p className="eyebrow">Get started</p>
          <h2 className="mx-auto mt-5 max-w-2xl text-4xl sm:text-5xl">
            Creating an account takes about a minute
          </h2>
          <p className="mx-auto mt-6 max-w-xl leading-9 text-banner-muted">
            Enter your mobile number, confirm the code we text you, and you are in. No password, no
            card details, nothing to cancel later.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="inline-flex min-h-14 items-center gap-3 rounded-lg bg-cta px-8 font-semibold text-cta-foreground transition-opacity hover:opacity-90"
            >
              Create an account <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex min-h-14 items-center rounded-lg border border-banner-foreground/30 px-8 font-semibold transition-colors hover:bg-banner-foreground/10"
            >
              I already have one
            </Link>
          </div>

          <p className="mt-8 inline-flex flex-wrap items-center justify-center gap-2 text-sm text-banner-muted">
            <BadgeCheck className="size-4" />
            Are you a doctor or clinic?
            <Link href="/join" className="font-semibold text-banner-foreground underline">
              List your practice
            </Link>
          </p>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
