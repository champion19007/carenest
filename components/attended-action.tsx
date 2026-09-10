'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { UserCheck } from 'lucide-react'
import { markAttended, type PracticeState } from '@/app/actions/practice'

const empty: PracticeState = {}

/**
 * "Patient was seen" for one confirmed appointment.
 *
 * Deliberately a separate control from accept/decline rather than a third
 * option on the same form: accepting is a statement about the future and can
 * be undone by declining later, while this asserts something already
 * happened and is the fact a review is gated on. Collapsing them into one
 * control would invite a clinician to mark attendance at booking time, which
 * would put the gate back where it started.
 */
export function AttendedAction({ bookingId }: { bookingId: string }) {
  const [state, submit] = useActionState(markAttended, empty)

  if (state.notice) {
    return <span className="text-sm font-semibold text-success">{state.notice}</span>
  }

  return (
    <form action={submit} className="flex shrink-0 items-center gap-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Submit />
      {state.error && (
        <p role="alert" className="text-sm font-medium text-warning">
          {state.error}
        </p>
      )}
    </form>
  )
}

function Submit() {
  const status = useFormStatus()
  return (
    <button
      type="submit"
      disabled={status.pending}
      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3.5 text-sm font-semibold transition-colors hover:border-success hover:text-success disabled:opacity-50"
    >
      <UserCheck className="size-4" />
      Mark as seen
    </button>
  )
}
