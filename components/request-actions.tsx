'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Check, X } from 'lucide-react'
import { respondToRequest, type PracticeState } from '@/app/actions/practice'

const empty: PracticeState = {}

/**
 * Accept / decline for one request.
 *
 * Both buttons submit the same form and differ only by the value they carry,
 * so the decision travels with the submission rather than being held in state
 * that could drift from the button the clinician actually pressed.
 */
export function RequestActions({ bookingId }: { bookingId: string }) {
  const [state, submit] = useActionState(respondToRequest, empty)

  return (
    <form action={submit} className="flex shrink-0 flex-col gap-2 sm:w-40">
      <input type="hidden" name="bookingId" value={bookingId} />

      <Decision
        value="confirmed"
        label="Accept"
        icon={<Check className="size-4" />}
        className="bg-cta text-cta-foreground"
      />
      <Decision
        value="declined"
        label="Decline"
        icon={<X className="size-4" />}
        className="border border-border hover:border-warning hover:text-warning"
      />

      {state.error && (
        <p role="alert" className="text-sm font-medium text-warning">
          {state.error}
        </p>
      )}
    </form>
  )
}

function Decision({
  value,
  label,
  icon,
  className,
}: {
  value: string
  label: string
  icon: React.ReactNode
  className: string
}) {
  const status = useFormStatus()
  return (
    <button
      type="submit"
      name="decision"
      value={value}
      disabled={status.pending}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 font-semibold transition-opacity disabled:opacity-50 ${className}`}
    >
      {icon}
      {label}
    </button>
  )
}
