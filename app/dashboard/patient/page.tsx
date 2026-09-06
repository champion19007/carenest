'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  CalendarClock,
  FileText,
  FlaskConical,
  IndianRupee,
  MapPin,
  Plus,
  Users,
  Video,
} from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { providers } from '@/lib/data'

const checklist = [
  { id: 'checkup', emoji: '\u{1FA7A}', title: 'Annual health checkup', body: 'Recommended once a year, especially after 30.' },
  { id: 'sugar', emoji: '\u{1FA78}', title: 'Blood sugar test', body: 'India has one of the highest diabetes rates — screen yearly.' },
  { id: 'dental', emoji: '\u{1F9B7}', title: 'Dental cleaning', body: 'A scaling every 6 months prevents gum disease.' },
  { id: 'eye', emoji: '\u{1F453}', title: 'Eye checkup', body: 'Screen-heavy work? Get your vision checked annually.' },
]

const upcoming = providers[0]

export default function PatientHome() {
  const [done, setDone] = useState<string[]>([])
  const progress = Math.round((done.length / checklist.length) * 100)

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />

      <div className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1320px] px-5 py-10 lg:px-8">
          <h1 className="text-3xl font-extrabold sm:text-4xl">Namaste, Aarav 👋</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Here&apos;s what needs your attention today.
          </p>

          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { Icon: CalendarClock, label: 'Upcoming visits', value: '1' },
              { Icon: FileText, label: 'Prescriptions', value: '4' },
              { Icon: FlaskConical, label: 'Lab reports', value: '2' },
              { Icon: Users, label: 'Family members', value: '3' },
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
          {/* Next appointment */}
          <section className="rounded-xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Next appointment</h2>
              <span className="rounded-md bg-success/10 px-2.5 py-1 text-sm font-bold text-success">
                Confirmed
              </span>
            </div>

            <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
              <span
                className={`flex size-16 shrink-0 items-center justify-center rounded-xl text-xl font-bold text-primary ${upcoming.tone}`}
              >
                {upcoming.initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold">{upcoming.name}</p>
                <p className="text-muted-foreground">{upcoming.speciality}</p>
                <p className="mt-2 flex items-center gap-2 text-sm">
                  <CalendarClock className="size-4 text-primary" />
                  {upcoming.nextSlot}
                </p>
                <p className="mt-1 flex items-start gap-2 text-sm">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                  {upcoming.clinic}, {upcoming.locality}
                </p>
                <p className="mt-1 flex items-center gap-2 text-sm font-semibold">
                  <IndianRupee className="size-4 text-primary" />
                  {upcoming.fee} payable at clinic
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/provider/${upcoming.id}`}
                className="inline-flex min-h-11 items-center rounded-lg bg-cta px-5 font-semibold text-cta-foreground"
              >
                View details
              </Link>
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-lg border border-border px-5 font-semibold hover:border-primary"
              >
                Reschedule
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-5 font-semibold hover:border-primary"
              >
                <Video className="size-4" />
                Switch to video
              </button>
            </div>
          </section>

          {/* Health checklist */}
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-xl font-bold">Your health checklist</h2>
            <p className="mt-1.5 text-muted-foreground">
              Preventive checks recommended for your age group.
            </p>

            <div
              className="mt-5 h-2.5 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={done.length}
              aria-valuemin={0}
              aria-valuemax={checklist.length}
              aria-label="Checklist progress"
            >
              <div
                className="h-full rounded-full bg-cta transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {done.length} of {checklist.length} completed
            </p>

            <div className="mt-5 divide-y divide-border">
              {checklist.map((item) => {
                const complete = done.includes(item.id)
                return (
                  <div key={item.id} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-soft text-xl">
                      {item.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold">{item.title}</h3>
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-bold ${
                            complete ? 'bg-success/10 text-success' : 'bg-accent/15 text-warning'
                          }`}
                        >
                          {complete ? 'Done' : 'Due'}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setDone(complete ? done.filter((id) => id !== item.id) : [...done, item.id])
                        }
                        className="text-sm font-semibold text-primary hover:underline"
                      >
                        {complete ? 'Undo' : 'Mark done'}
                      </button>
                      <Link
                        href="/search"
                        className="inline-flex min-h-10 items-center rounded-lg border border-border px-4 text-sm font-semibold hover:border-primary"
                      >
                        Book
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        {/* Right rail */}
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-xl font-bold">Family members</h2>
            <div className="mt-5 space-y-4">
              {[
                { name: 'Aarav Sharma', relation: 'Self · 32 yrs' },
                { name: 'Priya Sharma', relation: 'Spouse · 30 yrs' },
                { name: 'Ramesh Sharma', relation: 'Father · 64 yrs' },
              ].map(({ name, relation }) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-soft text-sm font-bold text-primary">
                    {name
                      .split(' ')
                      .map((part) => part[0])
                      .join('')}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{name}</p>
                    <p className="truncate text-sm text-muted-foreground">{relation}</p>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary font-semibold text-primary transition-colors hover:bg-soft"
            >
              <Plus className="size-4" />
              Add family member
            </button>
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
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{kind}</p>
                    <p className="text-sm text-muted-foreground">Not added</p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-sm font-semibold text-primary hover:underline"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface p-6">
            <FlaskConical className="size-6 text-primary" />
            <h2 className="mt-4 text-xl font-bold">Due for a checkup?</h2>
            <p className="mt-2 leading-7 text-muted-foreground">
              Book a full body test with free home sample collection.
            </p>
            <Link
              href="/labs"
              className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-cta px-5 font-semibold text-cta-foreground"
            >
              Browse packages
            </Link>
          </section>
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
