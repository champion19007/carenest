'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { FileText, IndianRupee, ShieldAlert, TriangleAlert } from 'lucide-react'
import { disputeEstimateAction, type EstimateState } from '@/app/actions/leads'

const empty: EstimateState = {}

export type EstimateView = {
  id: string
  procedure: string
  hospital: string
  roomTier: string
  lineItems: { label: string; amount: number; note?: string }[]
  total: number
  contentHash: string
  supersedes: string | null
  validUntil: string | null
}

/**
 * The estimate as the patient sees it, before admission.
 *
 * Every line is shown rather than a single figure, because the surprise on the
 * final bill is never the surgeon's fee — it is the room category, the
 * consumables and the administration charge that were never named. A total
 * with no breakdown is the thing this replaces.
 *
 * The fingerprint is printed deliberately. It lets someone at the admissions
 * desk compare the sheet on their phone with the sheet on file without either
 * side having to trust our interface.
 */
export function EstimateSheet({ estimate }: { estimate: EstimateView }) {
  const [state, submit] = useActionState(disputeEstimateAction, empty)
  const [open, setOpen] = useState(false)

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-primary">
            <FileText className="size-4" />
            Itemised estimate
          </p>
          <h3 className="mt-2 text-xl font-bold">{estimate.procedure}</h3>
          <p className="text-muted-foreground">
            {estimate.hospital} · {estimate.roomTier}
          </p>
        </div>

        {estimate.supersedes && (
          <span className="rounded-md bg-warning/10 px-2.5 py-1 text-xs font-bold text-warning">
            Re-priced
          </span>
        )}
      </div>

      <table className="mt-6 w-full text-sm">
        <caption className="sr-only">Breakdown of the estimated cost</caption>
        <tbody>
          {estimate.lineItems.map((item) => (
            <tr key={item.label} className="border-b border-border/70">
              <th scope="row" className="py-2.5 text-left font-normal">
                {item.label}
                {item.note && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">{item.note}</span>
                )}
              </th>
              <td className="py-2.5 text-right font-semibold tabular-nums">
                ₹{item.amount.toLocaleString('en-IN')}
              </td>
            </tr>
          ))}
          <tr>
            <th scope="row" className="pt-4 text-left text-base font-bold">
              Total
            </th>
            <td className="pt-4 text-right text-lg font-bold tabular-nums">
              <span className="inline-flex items-center">
                <IndianRupee className="size-4" />
                {estimate.total.toLocaleString('en-IN')}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <p className="mt-5 flex items-start gap-2 rounded-lg bg-soft px-4 py-3 text-sm leading-6 text-muted-foreground">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>
          This estimate cannot be edited. If the price changes, the hospital must issue a new one
          and this version stays on record.
          {estimate.validUntil && (
            <> Valid until {new Date(estimate.validUntil).toLocaleDateString('en-IN')}.</>
          )}
          <span className="mt-1 block font-mono text-xs">Reference {estimate.contentHash}</span>
        </span>
      </p>

      {state.notice ? (
        <p className="mt-5 rounded-lg bg-success/10 px-4 py-3 text-sm font-semibold text-success">
          {state.notice}
        </p>
      ) : open ? (
        <form action={submit} className="mt-5 rounded-lg border border-border p-4">
          <input type="hidden" name="estimateId" value={estimate.id} />

          <p className="font-semibold">What are they asking for?</p>

          <label className="mt-3 block text-sm">
            Amount quoted at the desk
            <input
              type="number"
              name="quotedTotal"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="Optional"
              className="field mt-1.5"
            />
          </label>

          <label className="mt-3 block text-sm">
            What changed
            <textarea
              name="detail"
              rows={3}
              required
              minLength={10}
              placeholder="e.g. they are charging for a private room, but the estimate says general ward"
              className="field mt-1.5"
            />
          </label>

          {state.error && (
            <p role="alert" className="mt-3 text-sm font-medium text-warning">
              {state.error}
            </p>
          )}

          <div className="mt-4 flex gap-3">
            <Submit />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold transition-colors hover:border-warning hover:text-warning"
        >
          <TriangleAlert className="size-4" />
          The clinic is asking for a different amount
        </button>
      )}
    </section>
  )
}

function Submit() {
  const status = useFormStatus()
  return (
    <button
      type="submit"
      disabled={status.pending}
      className="min-h-11 rounded-lg bg-cta px-5 text-sm font-semibold text-cta-foreground disabled:opacity-50"
    >
      {status.pending ? 'Recording…' : 'Flag this'}
    </button>
  )
}
