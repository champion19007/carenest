'use client'

import Link from 'next/link'
import { Avatar } from '@/components/avatar'
import { EmptyArt } from '@/components/empty-art'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  BadgeCheck,
  CalendarClock,
  IndianRupee,
  Languages as LanguagesIcon,
  MapPin,
  SlidersHorizontal,
  Star,
  ThumbsUp,
  Video,
  X,
} from 'lucide-react'
import type { DoctorRow } from '@/lib/db/sql'

const feeBands = ['Under ₹500', '₹500 - ₹800', '₹800 - ₹1200', '₹1200+']
const experienceBands = ['0-5 years', '5-10 years', '10+ years', '15+ years']
const sorts = [
  { id: 'relevance', label: 'Relevance' },
  { id: 'rating', label: 'Top rated' },
  { id: 'fee-low', label: 'Fee: low to high' },
  { id: 'experience', label: 'Most experienced' },
]

export type InitialFilters = {
  specialities: string[]
  languages: string[]
  fees: string
  experience: string
  video: boolean
  cashless: boolean
  femaleOnly: boolean
  sort: string
}

/**
 * Filters are held in the URL, not component state, so a filtered result set
 * is linkable, shareable and indexable. Each change pushes a new query string
 * and the server re-runs the SQL.
 */
export function DoctorResults({
  doctors,
  specialities,
  languages,
  initial,
}: {
  doctors: DoctorRow[]
  specialities: string[]
  languages: string[]
  initial: InitialFilters
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [drawerOpen, setDrawerOpen] = useState(false)

  function apply(mutate: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString())
    mutate(next)
    startTransition(() => router.push(`/search?${next.toString()}`, { scroll: false }))
  }

  function toggleMulti(key: string, value: string) {
    apply((next) => {
      const current = next.get(key)?.split(',').filter(Boolean) ?? []
      const updated = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
      if (updated.length) next.set(key, updated.join(','))
      else next.delete(key)
    })
  }

  function toggleFlag(key: string, on: boolean) {
    apply((next) => (on ? next.set(key, '1') : next.delete(key)))
  }

  function setBand(key: string, value: string, active: boolean) {
    apply((next) => (active ? next.delete(key) : next.set(key, value)))
  }

  const activeCount =
    initial.specialities.length +
    initial.languages.length +
    (initial.fees ? 1 : 0) +
    (initial.experience ? 1 : 0) +
    (initial.video ? 1 : 0) +
    (initial.cashless ? 1 : 0) +
    (initial.femaleOnly ? 1 : 0)

  const panel = (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="font-bold">Filters</h2>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => startTransition(() => router.push('/search', { scroll: false }))}
            className="text-sm font-semibold text-primary hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="max-h-[calc(100vh-12rem)] overflow-y-auto px-5 py-2">
        <Group title="Quick filters" hint="Narrow to the format of appointment you want.">
          <Toggle
            label="Offers video consultation"
            checked={initial.video}
            onChange={() => toggleFlag('video', !initial.video)}
          />
          <Toggle
            label="Cashless insurance accepted"
            checked={initial.cashless}
            onChange={() => toggleFlag('cashless', !initial.cashless)}
          />
          <Toggle
            label="Female doctors only"
            checked={initial.femaleOnly}
            onChange={() => toggleFlag('female', !initial.femaleOnly)}
          />
        </Group>

        <Group title="Speciality" hint="Not sure? A General Physician can refer you on.">
          {specialities.map((item) => (
            <Toggle
              key={item}
              label={item}
              checked={initial.specialities.includes(item)}
              onChange={() => toggleMulti('speciality', item)}
            />
          ))}
        </Group>

        <Group title="Consultation fee" hint="What the doctor charges to see you. Tests are extra.">
          {feeBands.map((item) => (
            <Toggle
              key={item}
              type="radio"
              label={item}
              checked={initial.fees === item}
              onChange={() => setBand('fees', item, initial.fees === item)}
            />
          ))}
        </Group>

        <Group title="Experience">
          {experienceBands.map((item) => (
            <Toggle
              key={item}
              type="radio"
              label={item}
              checked={initial.experience === item}
              onChange={() => setBand('experience', item, initial.experience === item)}
            />
          ))}
        </Group>

        <Group title="Speaks" hint="Being able to describe symptoms in your own language matters." last>
          {languages.map((item) => (
            <Toggle
              key={item}
              label={item}
              checked={initial.languages.includes(item)}
              onChange={() => toggleMulti('language', item)}
            />
          ))}
        </Group>
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-[1320px] px-5 py-8 lg:px-8">
      <div className="grid gap-8 lg:grid-cols-[17rem_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-6">{panel}</div>
        </aside>

        <section className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-2xl">
              {doctors.length} {doctors.length === 1 ? 'doctor' : 'doctors'}
              {pending && <span className="ml-2 text-sm text-muted-foreground">updating…</span>}
            </h2>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 font-semibold lg:hidden"
              >
                <SlidersHorizontal className="size-4" />
                Filters
                {activeCount > 0 && (
                  <span className="rounded-full bg-cta px-2 py-0.5 text-xs text-cta-foreground">
                    {activeCount}
                  </span>
                )}
              </button>

              <label className="inline-flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Sort by</span>
                <select
                  value={initial.sort}
                  onChange={(event) =>
                    apply((next) =>
                      event.target.value === 'relevance'
                        ? next.delete('sort')
                        : next.set('sort', event.target.value),
                    )
                  }
                  className="min-h-11 rounded-lg border border-border bg-card px-3 font-semibold outline-none focus:ring-2 focus:ring-ring"
                >
                  {sorts.map(({ id, label }) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            {doctors.map((doctor) => (
              <DoctorCard key={doctor.id} doctor={doctor} />
            ))}

            {doctors.length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-12 text-center">
                <EmptyArt />
                <p className="mt-6 text-lg font-semibold">No doctors match these filters</p>
                <p className="mt-2 text-muted-foreground">
                  Try widening the fee range or removing a speciality.
                </p>
                <button
                  type="button"
                  onClick={() => startTransition(() => router.push('/search', { scroll: false }))}
                  className="mt-6 inline-flex min-h-12 items-center rounded-lg bg-cta px-6 font-semibold text-cta-foreground"
                >
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-[min(22rem,88vw)] overflow-y-auto bg-background p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl">Filters</h2>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close filters"
                className="inline-flex size-10 items-center justify-center rounded-lg border border-border"
              >
                <X className="size-5" />
              </button>
            </div>
            {panel}
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="mt-6 min-h-12 w-full rounded-lg bg-cta font-semibold text-cta-foreground"
            >
              Show {doctors.length} doctors
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Group({
  title,
  hint,
  children,
  last = false,
}: {
  title: string
  hint?: string
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <div className={last ? 'py-4' : 'border-b border-border py-4'}>
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {hint && <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
  type = 'checkbox',
}: {
  label: string
  checked: boolean
  onChange: () => void
  type?: 'checkbox' | 'radio'
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-1.5">
      <input
        type={type}
        checked={checked}
        onChange={onChange}
        className="size-4 shrink-0 accent-[var(--primary)]"
      />
      <span className="text-[0.95rem]">{label}</span>
    </label>
  )
}

function DoctorCard({ doctor }: { doctor: DoctorRow }) {
  return (
    <article className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md sm:p-6">
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-4">
            <Avatar name={doctor.name} speciality={doctor.speciality} size={64} />
            <div className="min-w-0">
              <h3 className="flex flex-wrap items-center gap-2 text-xl">
                <Link href={`/doctor/${doctor.slug}`} className="hover:underline">
                  {doctor.name}
                </Link>
                <BadgeCheck className="size-5 text-primary" aria-label="Registration verified" />
              </h3>
              <p className="mt-0.5 text-muted-foreground">{doctor.speciality}</p>
              <p className="mt-1 text-sm text-muted-foreground">{doctor.qualification}</p>
              <p className="mt-1 text-sm font-semibold">{doctor.experience} years experience</p>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-[0.95rem]">
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="font-semibold">{doctor.locality}</span>, {doctor.city} ·{' '}
                {doctor.clinic}
              </span>
            </p>
            <p className="flex items-center gap-2">
              <LanguagesIcon className="size-4 shrink-0 text-muted-foreground" />
              {doctor.languages.split(',').join(', ')}
            </p>
            <p className="flex items-center gap-2 font-semibold">
              <IndianRupee className="size-4" />
              {doctor.fee} consultation fee
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {doctor.reviews_count > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-accent/15 px-2.5 py-1 font-semibold text-warning">
                <Star className="size-3.5 fill-current" />
                {doctor.rating.toFixed(1)} · {doctor.reviews_count} reviews
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2.5 py-1 font-bold text-success">
              <ThumbsUp className="size-3.5" />
              Registration verified
            </span>
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

        <div className="flex shrink-0 flex-col justify-center gap-3 border-border lg:w-56 lg:border-l lg:pl-6">
          <p className="inline-flex items-center gap-2 font-semibold text-success">
            <CalendarClock className="size-4" />
            {doctor.next_slot}
          </p>
          <Link
            href={`/book/${doctor.slug}`}
            className="inline-flex min-h-12 items-center justify-center rounded-lg bg-cta px-5 font-semibold text-cta-foreground transition-opacity hover:opacity-90"
          >
            Book appointment
          </Link>
          <Link
            href={`/doctor/${doctor.slug}`}
            className="inline-flex min-h-12 items-center justify-center rounded-lg border border-border px-5 font-semibold transition-colors hover:border-primary"
          >
            View profile
          </Link>
          <p className="text-center text-xs text-muted-foreground">No booking fee</p>
        </div>
      </div>
    </article>
  )
}
