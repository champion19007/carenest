'use client'

import { useMemo, useState } from 'react'
import { Download, IndianRupee, Mail } from 'lucide-react'
import { PracticeHeading } from '@/components/practice-shell'

const reportTypes = ['Invoiced income', 'Collections', 'Appointments', 'New patients', 'Expenses']
const groupings = ['Daily', 'Weekly', 'Monthly']

/** Deterministic sample series so the chart is stable across renders. */
const series = [
  { label: 'Mon', value: 4200 },
  { label: 'Tue', value: 6800 },
  { label: 'Wed', value: 5100 },
  { label: 'Thu', value: 9200 },
  { label: 'Fri', value: 7400 },
  { label: 'Sat', value: 11600 },
]

export default function PracticeReportsPage() {
  const [type, setType] = useState(reportTypes[0])
  const [group, setGroup] = useState(groupings[0])

  const totals = useMemo(() => {
    const gross = series.reduce((sum, point) => sum + point.value, 0)
    const discount = Math.round(gross * 0.04)
    const net = gross - discount
    const tax = Math.round(net * 0.05)
    return { gross, discount, net, tax, invoice: net + tax }
  }, [])

  const peak = Math.max(...series.map((point) => point.value))

  return (
    <>
      <PracticeHeading
        title="Reports"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 font-semibold"
            >
              <Download className="size-4" />
              Download
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 font-semibold"
            >
              <Mail className="size-4" />
              Email
            </button>
          </div>
        }
      />

      <div className="space-y-5 p-5">
        <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-background p-4">
          <label className="min-w-0 flex-1">
            <span className="text-sm font-semibold">Report</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-lg border border-input bg-background px-3 font-medium outline-none focus:ring-2 focus:ring-ring"
            >
              {reportTypes.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0 flex-1">
            <span className="text-sm font-semibold">Group by</span>
            <select
              value={group}
              onChange={(event) => setGroup(event.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-lg border border-input bg-background px-3 font-medium outline-none focus:ring-2 focus:ring-ring"
            >
              {groupings.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0 flex-1">
            <span className="text-sm font-semibold">Period</span>
            <select className="mt-1.5 min-h-11 w-full rounded-lg border border-input bg-background px-3 font-medium outline-none focus:ring-2 focus:ring-ring">
              <option>Last 7 days</option>
              <option>Last 30 days</option>
              <option>This quarter</option>
            </select>
          </label>
        </div>

        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['Gross', totals.gross],
            ['Discount', totals.discount],
            ['Net income', totals.net],
            ['Tax (GST)', totals.tax],
            ['Invoiced', totals.invoice],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-xl border border-border bg-background p-5">
              <dt className="text-sm text-muted-foreground">{label as string}</dt>
              <dd className="mt-2 inline-flex items-center text-2xl font-extrabold">
                <IndianRupee className="size-5" />
                {(value as number).toLocaleString('en-IN')}
              </dd>
            </div>
          ))}
        </dl>

        <div className="rounded-xl border border-border bg-background p-5">
          <h2 className="font-bold">{type} · {group}</h2>
          <div className="mt-6 flex h-56 items-end gap-3">
            {series.map(({ label, value }) => (
              <div
                key={label}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
              >
                <span className="text-xs font-semibold text-muted-foreground">
                  ₹{(value / 1000).toFixed(1)}k
                </span>
                {/* The column is `h-full`, so this percentage has a definite
                    height to resolve against — without it the bar collapses. */}
                <div
                  className="w-full shrink-0 rounded-t bg-cta transition-all"
                  style={{ height: `${(value / peak) * 78}%` }}
                  role="img"
                  aria-label={`${label}: ₹${value}`}
                />
                <span className="text-xs font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
