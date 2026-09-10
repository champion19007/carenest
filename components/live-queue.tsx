'use client'

import { useEffect, useState } from 'react'
import { Clock, CircleCheck, CircleDot } from 'lucide-react'
import { slotTime } from '@/lib/slot-format'

type QueueStatus = {
  ahead: number
  delayMinutes: number
  estimatedStart: string
  arriveBy: string
  scheduledStart: string
  isNext: boolean
  isDone: boolean
}

/** Often enough to be useful, rarely enough to stay well inside the free tier. */
const POLL_MS = 30_000

/**
 * Live queue position for one appointment.
 *
 * The point of this component is to answer the question that makes people
 * arrive an hour early: "is the doctor running late?" Everything shown is
 * derived server-side from slot state, so nothing here can claim the clinic is
 * on time when it is not.
 *
 * It renders nothing at all when there is no queue to report — a booking for
 * next week, or one already finished. A component that insists on occupying
 * space to say "nothing yet" trains people to ignore it, which defeats the
 * one moment it needs to be believed.
 */
export function LiveQueue({ bookingId }: { bookingId: string }) {
  const [status, setStatus] = useState<QueueStatus | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true

    async function read() {
      try {
        const response = await fetch(`/api/queue/${bookingId}`, { cache: 'no-store' })
        if (!response.ok) throw new Error(String(response.status))
        const body = (await response.json()) as { status: QueueStatus | null }
        if (!active) return
        setStatus(body.status)
        setFailed(false)
      } catch {
        /* A failed poll is not worth an error message — the next one is 30
           seconds away. Only stop claiming a position we can no longer
           verify. */
        if (active) setFailed(true)
      }
    }

    read()
    const timer = setInterval(read, POLL_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [bookingId])

  if (!status || failed) return null

  if (status.isDone) {
    return (
      <p className="mt-4 flex items-center gap-2 rounded-lg bg-success/10 px-4 py-3 text-sm font-semibold text-success">
        <CircleCheck className="size-4 shrink-0" />
        Consultation complete. You can now leave a review.
      </p>
    )
  }

  const late = status.delayMinutes >= 5

  return (
    <div
      className="mt-4 rounded-lg border border-border bg-soft px-4 py-3.5"
      /* Announced politely: this updates while the page is open, and a patient
         using a screen reader should hear it change without being interrupted
         mid-sentence. */
      aria-live="polite"
    >
      <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-primary">
        <CircleDot className="size-4 shrink-0" />
        Live queue
      </p>

      <p className="mt-2 text-lg font-semibold">
        {status.isNext ? (
          'You are next in.'
        ) : (
          <>
            {status.ahead} {status.ahead === 1 ? 'patient' : 'patients'} ahead of you
          </>
        )}
      </p>

      <p className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="size-4 shrink-0" />
        {late ? (
          <>
            Running about {status.delayMinutes} minutes late — now expected around{' '}
            <span className="font-semibold text-foreground">
              {slotTime(status.estimatedStart)}
            </span>
          </>
        ) : (
          <>
            On time — expected at{' '}
            <span className="font-semibold text-foreground">
              {slotTime(status.estimatedStart)}
            </span>
          </>
        )}
      </p>

      <p className="mt-2 text-sm">
        Please arrive by{' '}
        <span className="font-semibold">{slotTime(status.arriveBy)}</span>.
      </p>

      {late && (
        <p className="mt-2 text-xs text-muted-foreground">
          Scheduled for {slotTime(status.scheduledStart)}. Updates every 30 seconds while this page
          is open.
        </p>
      )}
    </div>
  )
}
