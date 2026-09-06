'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Video } from 'lucide-react'
import { PracticeHeading } from '@/components/practice-shell'
import { queuePatients } from '@/lib/data'

const days = ['Mon 7', 'Tue 8', 'Wed 9', 'Thu 10', 'Fri 11', 'Sat 12']
const slots = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '17:00', '17:30', '18:00']

/** Bookings keyed by `${dayIndex}-${slot}`. */
const bookings: Record<string, { name: string; mode: 'clinic' | 'video' }> = {
  '0-09:30': { name: 'Sunita Patil', mode: 'clinic' },
  '0-10:00': { name: 'Ramesh Iyer', mode: 'clinic' },
  '1-11:00': { name: 'Arjun Nair', mode: 'video' },
  '2-17:30': { name: 'Kavita Joshi', mode: 'clinic' },
  '3-10:30': { name: 'Imran Shaikh', mode: 'video' },
  '4-18:00': { name: 'Deepa Rao', mode: 'clinic' },
}

export default function PracticeCalendarPage() {
  const [view, setView] = useState<'Day' | 'Week' | 'Month'>('Week')

  const counts = {
    today: 4,
    waiting: queuePatients.filter((patient) => patient.status === 'Waiting').length,
    engaged: queuePatients.filter((patient) => patient.status === 'Engaged').length,
    done: queuePatients.filter((patient) => patient.status === 'Met').length,
  }

  return (
    <>
      <PracticeHeading
        title="Calendar"
        action={
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg bg-muted p-1">
              {(['Day', 'Week', 'Month'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setView(value)}
                  className={`min-h-10 rounded-md px-4 text-sm font-semibold transition-colors ${
                    view === value ? 'bg-background shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-cta px-5 font-semibold text-cta-foreground"
            >
              <Plus className="size-4" />
              Walk-in
            </button>
          </div>
        }
      />

      <div className="grid gap-5 p-5 xl:grid-cols-[1fr_20rem]">
        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-background">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
            <p className="font-bold">7 – 12 Sep 2026</p>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Previous week" className="rounded-lg p-2 hover:bg-muted">
                <ChevronLeft className="size-4" />
              </button>
              <button type="button" className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-muted">
                Today
              </button>
              <button type="button" aria-label="Next week" className="rounded-lg p-2 hover:bg-muted">
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-20 border-b border-r border-border p-2 text-left font-semibold text-muted-foreground">
                    Time
                  </th>
                  {days.map((day) => (
                    <th key={day} className="border-b border-r border-border p-2 font-semibold">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slots.map((slot) => (
                  <tr key={slot}>
                    <td className="border-b border-r border-border p-2 align-top text-muted-foreground">
                      {slot}
                    </td>
                    {days.map((day, dayIndex) => {
                      const booking = bookings[`${dayIndex}-${slot}`]
                      return (
                        <td
                          key={day}
                          className="h-12 border-b border-r border-border p-1 align-top"
                        >
                          {booking && (
                            <div
                              className={`flex h-full items-center gap-1.5 rounded px-2 text-xs font-semibold ${
                                booking.mode === 'video'
                                  ? 'bg-accent/20 text-warning'
                                  : 'bg-soft text-primary'
                              }`}
                            >
                              {booking.mode === 'video' && <Video className="size-3 shrink-0" />}
                              <span className="truncate">{booking.name}</span>
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-xl border border-border bg-background p-5">
          <h2 className="font-bold">Today&apos;s schedule</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            {[
              ['Today', counts.today, 'bg-muted'],
              ['Waiting', counts.waiting, 'bg-accent/15 text-warning'],
              ['Engaged', counts.engaged, 'bg-soft text-primary'],
              ['Done', counts.done, 'bg-success/10 text-success'],
            ].map(([label, value, tone]) => (
              <div key={label as string} className={`rounded-lg p-3 ${tone as string}`}>
                <dt className="text-xs font-bold uppercase tracking-wide">{label as string}</dt>
                <dd className="mt-1 text-2xl font-extrabold">{value as number}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 space-y-3">
            {queuePatients.map((patient) => (
              <div key={patient.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-semibold">{patient.name}</p>
                  <span className="shrink-0 text-sm text-muted-foreground">{patient.time}</span>
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{patient.reason}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  )
}
