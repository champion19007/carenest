'use client'

import Link from 'next/link'
import { useState } from 'react'

/**
 * Preventive checks, ticked off locally.
 *
 * Deliberately not persisted: this is a nudge, not a medical record, and
 * storing "the user says they had a dental cleaning" beside real clinical data
 * would give an unverified self-report the same standing as a lab result.
 */
const checklist = [
  { id: 'checkup', emoji: '\u{1FA7A}', title: 'Annual health checkup', body: 'Recommended once a year, especially after 30.' },
  { id: 'sugar', emoji: '\u{1FA78}', title: 'Blood sugar test', body: 'India has one of the highest diabetes rates \u2014 screen yearly.' },
  { id: 'dental', emoji: '\u{1F9B7}', title: 'Dental cleaning', body: 'A scaling every 6 months prevents gum disease.' },
  { id: 'eye', emoji: '\u{1F453}', title: 'Eye checkup', body: 'Screen-heavy work? Get your vision checked annually.' },
]

export function HealthChecklist() {
  const [done, setDone] = useState<string[]>([])
  const progress = Math.round((done.length / checklist.length) * 100)

  return (
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
  )
}
