'use client'

import { useState } from 'react'
import { IndianRupee, Plus } from 'lucide-react'
import { PracticeHeading } from '@/components/practice-shell'

type Invoice = {
  id: string
  patient: string
  date: string
  amount: number
  mode: 'UPI' | 'Cash' | 'Card' | 'Pending'
}

const invoices: Invoice[] = [
  { id: 'INV-2041', patient: 'Ramesh Iyer', date: '06 Sep 2026', amount: 850, mode: 'UPI' },
  { id: 'INV-2040', patient: 'Sunita Patil', date: '06 Sep 2026', amount: 600, mode: 'Cash' },
  { id: 'INV-2039', patient: 'Kavita Joshi', date: '05 Sep 2026', amount: 1200, mode: 'Card' },
  { id: 'INV-2038', patient: 'Arjun Nair', date: '05 Sep 2026', amount: 600, mode: 'Pending' },
]

const modeTone: Record<Invoice['mode'], string> = {
  UPI: 'bg-success/10 text-success',
  Cash: 'bg-muted',
  Card: 'bg-soft text-primary',
  Pending: 'bg-accent/15 text-warning',
}

export default function PracticeBillingPage() {
  const [filter, setFilter] = useState<'All' | Invoice['mode']>('All')

  const rows = filter === 'All' ? invoices : invoices.filter((row) => row.mode === filter)
  const collected = rows
    .filter((row) => row.mode !== 'Pending')
    .reduce((sum, row) => sum + row.amount, 0)
  const outstanding = rows
    .filter((row) => row.mode === 'Pending')
    .reduce((sum, row) => sum + row.amount, 0)

  return (
    <>
      <PracticeHeading
        title="Billing"
        action={
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-cta px-5 font-semibold text-cta-foreground"
          >
            <Plus className="size-4" />
            New invoice
          </button>
        }
      />

      <div className="space-y-5 p-5">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Collected today', collected],
            ['Outstanding', outstanding],
            ['Invoices', rows.length],
          ].map(([label, value], index) => (
            <div key={label as string} className="rounded-xl border border-border bg-background p-5">
              <dt className="text-sm text-muted-foreground">{label as string}</dt>
              <dd className="mt-2 inline-flex items-center text-2xl font-extrabold">
                {index < 2 && <IndianRupee className="size-5" />}
                {(value as number).toLocaleString('en-IN')}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap gap-2">
          {(['All', 'UPI', 'Cash', 'Card', 'Pending'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilter(mode)}
              aria-pressed={filter === mode}
              className={`min-h-10 rounded-full border px-4 text-sm font-semibold transition-colors ${
                filter === mode
                  ? 'border-primary bg-cta text-cta-foreground'
                  : 'border-border hover:border-primary'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-background">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-border text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Invoice</th>
                <th className="px-5 py-3">Patient</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Mode</th>
                <th className="px-5 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-5 py-4 font-semibold">{row.id}</td>
                  <td className="px-5 py-4">{row.patient}</td>
                  <td className="px-5 py-4 text-muted-foreground">{row.date}</td>
                  <td className="px-5 py-4">
                    <span className={`rounded px-2 py-0.5 text-xs font-bold ${modeTone[row.mode]}`}>
                      {row.mode}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right font-bold">
                    <span className="inline-flex items-center">
                      <IndianRupee className="size-3.5" />
                      {row.amount.toLocaleString('en-IN')}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">
                    No invoices for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
