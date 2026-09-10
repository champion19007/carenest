'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Check, FileText, Phone, Send, X } from 'lucide-react'
import {
  approveLead,
  issueEstimateAction,
  rejectLead,
  routeLead,
  type EstimateState,
  type LeadState,
} from '@/app/actions/leads'

const empty: LeadState = {}

export type Lead = {
  id: string
  name: string
  phone: string
  city: string
  procedure: string
  notes: string
  status: string
  reject_reason: string | null
  created_at: string
  /** Whether a price has already been issued, so the form says "re-price". */
  has_estimate?: boolean
}

export type RoutableDoctor = { id: string; name: string; speciality: string }

/**
 * The admin triage queue for surgery enquiries.
 *
 * Nothing here routes automatically. An enquiry is free text from a stranger,
 * and the whole reason this screen exists is that a person reads it before a
 * surgeon's inbox and a diagnostic centre both receive someone's phone number.
 */
export function LeadQueue({ leads, doctors }: { leads: Lead[]; doctors: RoutableDoctor[] }) {
  const waiting = leads.filter((lead) => lead.status === 'NEW')
  const approved = leads.filter((lead) => lead.status === 'APPROVED')
  const closed = leads.filter((lead) => lead.status === 'ROUTED' || lead.status === 'REJECTED')

  return (
    <div className="space-y-8">
      <Group title="Waiting for review" count={waiting.length} empty="No new enquiries.">
        {waiting.map((lead) => (
          <LeadCard key={lead.id} lead={lead}>
            <ReviewButtons id={lead.id} />
          </LeadCard>
        ))}
      </Group>

      <Group title="Approved — ready to send on" count={approved.length} empty="Nothing approved is waiting.">
        {approved.map((lead) => (
          <LeadCard key={lead.id} lead={lead}>
            <div className="space-y-4">
              <RouteForm id={lead.id} doctors={doctors} />
              <EstimateForm leadId={lead.id} hasEstimate={lead.has_estimate} />
            </div>
          </LeadCard>
        ))}
      </Group>

      {closed.length > 0 && (
        <Group title="Closed" count={closed.length} empty="">
          {closed.slice(0, 10).map((lead) => (
            <li
              key={lead.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {lead.name}
                <span className="text-muted-foreground"> · {lead.procedure || 'Unspecified'}</span>
              </span>
              <span
                className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                  lead.status === 'ROUTED'
                    ? 'bg-success/10 text-success'
                    : 'bg-warning/10 text-warning'
                }`}
              >
                {lead.status === 'ROUTED' ? 'Sent on' : 'Rejected'}
              </span>
            </li>
          ))}
        </Group>
      )}
    </div>
  )
}

function Group({
  title,
  count,
  empty,
  children,
}: {
  title: string
  count: number
  empty: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h3 className="font-bold">
        {title}
        {count > 0 && (
          <span className="ml-2 rounded-full bg-soft px-2 py-0.5 text-sm text-primary">{count}</span>
        )}
      </h3>
      {count === 0 ? (
        empty ? (
          <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
        ) : null
      ) : (
        <ul className="mt-4 space-y-4">{children}</ul>
      )}
    </section>
  )
}

function LeadCard({ lead, children }: { lead: Lead; children: React.ReactNode }) {
  return (
    <li className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-bold">{lead.name}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {lead.procedure || 'Procedure not specified'}
            {lead.city && ` · ${lead.city}`}
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm">
            <Phone className="size-4 text-primary" />
            +91 {lead.phone}
          </p>
          {lead.notes && (
            <p className="mt-3 max-w-prose rounded-lg bg-muted px-3 py-2 text-sm leading-6">
              {lead.notes}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </li>
  )
}

function ReviewButtons({ id }: { id: string }) {
  const [approveState, approve] = useActionState(approveLead, empty)
  const [rejectState, reject] = useActionState(rejectLead, empty)
  const [rejecting, setRejecting] = useState(false)

  if (rejecting) {
    return (
      <form action={reject} className="space-y-3">
        <input type="hidden" name="id" value={id} />
        <input
          name="reason"
          placeholder="Why is this being rejected?"
          className="field"
          autoFocus
        />
        {rejectState.error && (
          <p role="alert" className="text-sm font-medium text-warning">
            {rejectState.error}
          </p>
        )}
        <div className="flex gap-2">
          <Pending
            className="bg-warning/15 text-warning"
            label="Confirm rejection"
            icon={<X className="size-4" />}
          />
          <button
            type="button"
            onClick={() => setRejecting(false)}
            className="min-h-11 rounded-lg px-4 text-sm font-semibold text-muted-foreground hover:underline"
          >
            Cancel
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={approve}>
        <input type="hidden" name="id" value={id} />
        <Pending
          className="bg-cta text-cta-foreground"
          label="Approve"
          icon={<Check className="size-4" />}
        />
      </form>
      <button
        type="button"
        onClick={() => setRejecting(true)}
        className="min-h-11 rounded-lg border border-border px-4 font-semibold hover:border-warning hover:text-warning"
      >
        Reject
      </button>
      {approveState.error && (
        <p role="alert" className="text-sm font-medium text-warning">
          {approveState.error}
        </p>
      )}
    </div>
  )
}

function RouteForm({ id, doctors }: { id: string; doctors: RoutableDoctor[] }) {
  const [state, submit] = useActionState(routeLead, empty)

  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="id" value={id} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold">Send to a surgeon</span>
          <select name="doctorId" defaultValue="" className="field mt-1.5">
            <option value="">Nobody</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name} — {doctor.speciality}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-semibold">Send to a diagnostic centre</span>
          <input
            name="centreName"
            placeholder="e.g. Metropolis, Kharghar"
            className="field mt-1.5"
          />
        </label>
      </div>

      {state.error && (
        <p role="alert" className="text-sm font-medium text-warning">
          {state.error}
        </p>
      )}

      <Pending
        className="bg-cta text-cta-foreground"
        label="Send on"
        icon={<Send className="size-4" />}
      />
    </form>
  )
}

function Pending({
  label,
  icon,
  className,
}: {
  label: string
  icon: React.ReactNode
  className: string
}) {
  const status = useFormStatus()
  return (
    <button
      type="submit"
      disabled={status.pending}
      className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-5 font-semibold transition-opacity disabled:opacity-50 ${className}`}
    >
      {icon}
      {status.pending ? 'Working…' : label}
    </button>
  )
}

/**
 * Price an approved enquiry.
 *
 * Four fixed lines rather than a free-form builder, because they are the four
 * that cause disputes: the surgeon's fee is expected, and the room category,
 * consumables and hospital charges are the ones that appear for the first time
 * on the final bill. Naming them here is the entire feature.
 */
function EstimateForm({ leadId, hasEstimate }: { leadId: string; hasEstimate?: boolean }) {
  const [state, submit] = useActionState(issueEstimateAction, {} as EstimateState)

  const lines = [
    { label: 'Surgeon fee', placeholder: '35000' },
    { label: 'Anaesthesia', placeholder: '12000' },
    { label: 'Room rent', placeholder: '4000' },
    { label: 'Consumables and dressings', placeholder: '6500' },
    { label: 'Hospital and admission charges', placeholder: '5000' },
  ]

  return (
    <form action={submit} className="rounded-lg border border-border p-4">
      <input type="hidden" name="leadId" value={leadId} />

      <p className="font-semibold">
        {hasEstimate ? 'Re-price this enquiry' : 'Issue an itemised estimate'}
      </p>
      {hasEstimate && (
        <p className="mt-1 text-sm text-muted-foreground">
          The current estimate stays on record and the patient sees that it changed.
        </p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Hospital
          <input name="hospital" required className="field mt-1.5" placeholder="Sunrise Multispeciality" />
        </label>
        <label className="text-sm">
          Room category
          <select name="roomTier" defaultValue="General ward" className="field mt-1.5">
            <option>General ward</option>
            <option>Twin sharing</option>
            <option>Private room</option>
            <option>Deluxe room</option>
          </select>
        </label>
      </div>

      <div className="mt-4 space-y-2">
        {lines.map((line) => (
          <div key={line.label} className="flex items-center gap-3">
            <input type="hidden" name="itemLabel" value={line.label} />
            <span className="min-w-0 flex-1 text-sm">{line.label}</span>
            <input
              type="number"
              name="itemAmount"
              min="0"
              step="1"
              inputMode="numeric"
              defaultValue="0"
              placeholder={line.placeholder}
              className="field w-32 text-right"
              aria-label={line.label}
            />
          </div>
        ))}
      </div>

      {state.error && (
        <p role="alert" className="mt-3 text-sm font-medium text-warning">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p className="mt-3 text-sm font-semibold text-success">{state.notice}</p>
      )}

      <Pending
        className="bg-cta text-cta-foreground"
        label={hasEstimate ? 'Issue new estimate' : 'Issue estimate'}
        icon={<FileText className="size-4" />}
      />
    </form>
  )
}
