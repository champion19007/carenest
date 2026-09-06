'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  BadgeCheck,
  CalendarClock,
  Home,
  IndianRupee,
  Languages,
  MapPin,
  PawPrint,
  Phone,
  ShieldCheck,
  Star,
  Syringe,
  Video,
} from 'lucide-react'
import { Disclosure } from '@/components/disclosure'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import {
  petConcerns,
  petServices,
  petSpecies,
  petVaccineSchedule,
  vetSpecialities,
  vets,
  type Species,
} from '@/lib/data'

export default function PetsPage() {
  const [species, setSpecies] = useState<Species | 'All'>('All')
  const [speciality, setSpeciality] = useState('')
  const [homeOnly, setHomeOnly] = useState(false)

  const visibleVets = useMemo(
    () =>
      vets.filter((vet) => {
        if (species !== 'All' && !vet.treats.includes(species)) return false
        if (speciality && vet.speciality !== speciality) return false
        if (homeOnly && !vet.homeVisit) return false
        return true
      }),
    [species, speciality, homeOnly],
  )

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero ---------------------------------------------------------- */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1320px] px-5 py-12 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full bg-soft px-4 py-1.5 text-sm font-semibold text-primary">
            <PawPrint className="size-4" />
            CareNest for pets
          </span>
          <h1 className="mt-4 max-w-3xl text-balance text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">
            Vets who come to your home — for dogs, cats, birds and cattle
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
            Vaccination, deworming, grooming, surgery and diagnostics from registered veterinary
            doctors. Clinic visits from ₹500, home visits across Navi Mumbai.
          </p>

          {/* Species picker */}
          <div className="mt-8">
            <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Who are we treating?
            </p>
            <div className="mt-3 flex flex-wrap gap-2.5">
              <SpeciesChip
                label="All pets"
                emoji="🐾"
                active={species === 'All'}
                onClick={() => setSpecies('All')}
              />
              {petSpecies.map(({ name, emoji }) => (
                <SpeciesChip
                  key={name}
                  label={name}
                  emoji={emoji}
                  active={species === name}
                  onClick={() => setSpecies(name)}
                />
              ))}
            </div>
          </div>

          {/* Emergency strip */}
          <div className="mt-8 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-5">
            <Phone className="size-6 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">24×7 pet emergency helpline</p>
              <p className="text-sm text-muted-foreground">
                Poisoning, road accident, difficulty breathing, seizures — call before you travel.
              </p>
            </div>
            <a
              href="tel:+911800456789"
              className="inline-flex min-h-11 items-center rounded-lg bg-cta px-5 font-semibold text-cta-foreground"
            >
              Call 1800-456-789
            </a>
          </div>
        </div>
      </section>

      {/* Services ------------------------------------------------------ */}
      <section className="mx-auto max-w-[1320px] px-5 py-12 lg:px-8">
        <h2 className="text-2xl font-extrabold sm:text-3xl">Pet services</h2>
        <p className="mt-2 text-muted-foreground">
          Book at a clinic or at home. Prices are indicative and vary by pet size and city.
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {petServices.map(({ name, emoji, from, body }) => (
            <article key={name} className="flex flex-col rounded-xl border border-border bg-card p-5">
              <span
                className="flex size-12 items-center justify-center rounded-xl bg-soft text-2xl"
                aria-hidden="true"
              >
                {emoji}
              </span>
              <h3 className="mt-4 text-lg font-bold">{name}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{body}</p>
              <p className="mt-4 inline-flex items-center text-sm font-semibold">
                from <IndianRupee className="mx-1 size-3.5" />
                {from}
              </p>
              <Link
                href="#vets"
                className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-primary font-semibold text-primary transition-colors hover:bg-soft"
              >
                Book
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* Vets ---------------------------------------------------------- */}
      <section id="vets" className="border-y border-border bg-surface">
        <div className="mx-auto max-w-[1320px] px-5 py-12 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold sm:text-3xl">Veterinary doctors near you</h2>
              <p className="mt-2 text-muted-foreground">
                {visibleVets.length} {visibleVets.length === 1 ? 'vet' : 'vets'} available
                {species !== 'All' && ` for ${species.toLowerCase()}s`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={speciality}
                onChange={(event) => setSpeciality(event.target.value)}
                aria-label="Filter by veterinary speciality"
                className="min-h-11 rounded-lg border border-border bg-card px-3 font-semibold outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All specialities</option>
                {vetSpecialities.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setHomeOnly(!homeOnly)}
                aria-pressed={homeOnly}
                className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 font-semibold transition-colors ${
                  homeOnly
                    ? 'border-primary bg-cta text-cta-foreground'
                    : 'border-border hover:border-primary'
                }`}
              >
                <Home className="size-4" />
                Home visit
              </button>
            </div>
          </div>

          <div className="mt-7 space-y-5">
            {visibleVets.map((vet) => (
              <article key={vet.id} className="rounded-xl border border-border bg-card p-5 sm:p-6">
                <div className="flex flex-col gap-6 lg:flex-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-4">
                      <span
                        className={`flex size-16 shrink-0 items-center justify-center rounded-xl text-xl font-bold text-primary ${vet.tone}`}
                      >
                        {vet.initials}
                      </span>
                      <div className="min-w-0">
                        <h3 className="flex flex-wrap items-center gap-2 text-xl font-bold">
                          {vet.name}
                          <BadgeCheck className="size-5 text-primary" aria-label="Verified" />
                        </h3>
                        <p className="mt-0.5 text-muted-foreground">{vet.speciality}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{vet.qualification}</p>
                        <p className="mt-1 text-sm font-semibold">
                          {vet.experience} years experience
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2 text-[0.95rem]">
                      <p className="flex items-start gap-2">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span>
                          <span className="font-semibold">{vet.locality}</span>, {vet.city} ·{' '}
                          {vet.clinic}
                        </span>
                      </p>
                      <p className="flex items-center gap-2">
                        <Languages className="size-4 shrink-0 text-muted-foreground" />
                        {vet.languages.join(', ')}
                      </p>
                      <p className="flex items-center gap-2 font-semibold">
                        <IndianRupee className="size-4" />
                        {vet.fee} consultation fee
                      </p>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-sm">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-accent/15 px-2.5 py-1 font-semibold text-warning">
                        <Star className="size-3.5 fill-current" />
                        {vet.rating} · {vet.reviews} reviews
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-soft px-2.5 py-1 font-semibold text-primary">
                        <PawPrint className="size-3.5" />
                        Treats {vet.treats.join(', ')}
                      </span>
                      {vet.homeVisit && (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2.5 py-1 font-semibold text-success">
                          <Home className="size-3.5" />
                          Home visit
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col justify-center gap-3 border-border lg:w-56 lg:border-l lg:pl-6">
                    <p className="inline-flex items-center gap-2 font-semibold text-success">
                      <CalendarClock className="size-4" />
                      {vet.nextSlot}
                    </p>
                    <button
                      type="button"
                      className="inline-flex min-h-12 items-center justify-center rounded-lg bg-cta px-5 font-semibold text-cta-foreground transition-opacity hover:opacity-90"
                    >
                      Book appointment
                    </button>
                    {vet.video && (
                      <button
                        type="button"
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-primary px-5 font-semibold text-primary transition-colors hover:bg-soft"
                      >
                        <Video className="size-4" />
                        Video consult
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}

            {visibleVets.length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-12 text-center">
                <p className="text-lg font-semibold">No vets match these filters</p>
                <button
                  type="button"
                  onClick={() => {
                    setSpecies('All')
                    setSpeciality('')
                    setHomeOnly(false)
                  }}
                  className="mt-5 inline-flex min-h-12 items-center rounded-lg bg-cta px-6 font-semibold text-cta-foreground"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Vaccination schedule + concerns -------------------------------- */}
      <section className="mx-auto max-w-[1320px] px-5 py-12 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="inline-flex items-center gap-3 text-2xl font-extrabold sm:text-3xl">
              <Syringe className="size-7 text-primary" />
              Puppy &amp; kitten vaccination schedule
            </h2>
            <p className="mt-2 text-muted-foreground">
              Anti-rabies is required for dogs under most municipal rules in India. Keep the stamped
              card safe — you will need it for boarding and travel.
            </p>

            <div className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {petVaccineSchedule.map(({ age, shots }) => (
                <div key={age} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <span className="w-32 shrink-0 font-bold text-primary">{age}</span>
                  <span className="min-w-0 flex-1 text-[0.95rem]">{shots}</span>
                </div>
              ))}
            </div>

            <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              Schedules vary by vaccine brand and your pet&apos;s health. Always confirm timing with
              your vet.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">Common pet concerns</h2>
            <div className="mt-6">
              {Object.entries(petConcerns).map(([group, items]) => (
                <Disclosure key={group} label={group} items={items} />
              ))}
            </div>

            <div className="mt-8 rounded-xl border border-border bg-surface p-6">
              <h3 className="text-xl font-bold">Pet insurance</h3>
              <p className="mt-2 leading-7 text-muted-foreground">
                Cover surgery, hospitalisation and third-party liability for your dog or cat. Compare
                plans from partner insurers and add your policy to your CareNest account.
              </p>
              <Link
                href="/help/payments-insurance/cashless-claims"
                className="mt-5 inline-flex min-h-11 items-center rounded-lg border border-primary px-5 font-semibold text-primary transition-colors hover:bg-soft"
              >
                Learn about pet cover
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}

function SpeciesChip({
  label,
  emoji,
  active,
  onClick,
}: {
  label: string
  emoji: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 font-semibold transition-colors ${
        active
          ? 'border-primary bg-cta text-cta-foreground'
          : 'border-border bg-card hover:border-primary hover:bg-soft'
      }`}
    >
      <span aria-hidden="true">{emoji}</span>
      {label}
    </button>
  )
}
