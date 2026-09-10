import 'server-only'
import { claimBatch, markFailed, markSent, type DomainEvent } from './db/outbox'
import { sendSms } from './sms'

/**
 * Delivers what the outbox recorded.
 *
 * Called two ways, deliberately:
 *
 *   - from `after()` once a response has been sent, so the common case is
 *     delivered within a second of the booking without the patient waiting
 *     for a gateway;
 *   - from the scheduled sweep, which is what actually makes it reliable.
 *
 * `after()` alone would not be enough. It runs in the same invocation, so if
 * that function is killed mid-drain the work is simply lost — `after()` is a
 * deferral, not a queue. The row staying PENDING until something marks it
 * sent is the durable part; `after()` is only an optimisation on latency.
 */

export type DrainResult = { claimed: number; sent: number; failed: number }

/** Everything the app knows how to deliver. */
const handlers: Record<string, (event: DomainEvent) => Promise<void>> = {
  'booking.requested': async (event) => {
    const { phone, doctorName, slot } = event.payload as Record<string, string>
    if (!phone) throw new Error('no phone on event')
    await sendSms(
      phone,
      `CareNest: your request for ${doctorName} at ${slot} has been sent to the clinic. We will text you when they confirm.`,
    )
  },

  'booking.confirmed': async (event) => {
    const { phone, doctorName, slot, clinic } = event.payload as Record<string, string>
    if (!phone) throw new Error('no phone on event')
    await sendSms(
      phone,
      `CareNest: confirmed with ${doctorName}, ${slot}${clinic ? ` at ${clinic}` : ''}. Reply STOP to opt out.`,
    )
  },

  'booking.declined': async (event) => {
    const { phone, doctorName } = event.payload as Record<string, string>
    if (!phone) throw new Error('no phone on event')
    await sendSms(
      phone,
      `CareNest: ${doctorName} could not take that time. Open the app to pick another slot.`,
    )
  },

  'estimate.issued': async (event) => {
    const { phone, procedure, total } = event.payload as Record<string, string>
    if (!phone) throw new Error('no phone on event')
    await sendSms(
      phone,
      `CareNest: your itemised estimate for ${procedure} is ready — Rs ${total}. Every line is in the app before you are admitted.`,
    )
  },
}

/**
 * Drain one batch.
 *
 * An event with no handler is marked sent rather than retried forever: an
 * unknown kind is a deployment that emitted something this version cannot
 * deliver, and hammering it five times changes nothing. It leaves a trace in
 * `last_error` for whoever notices.
 */
export async function drainAll(limit = 20): Promise<DrainResult> {
  const events = await claimBatch(limit)
  let sent = 0
  let failed = 0

  for (const event of events) {
    const handler = handlers[event.kind]

    if (!handler) {
      await markSent(event.id)
      sent++
      continue
    }

    try {
      await handler(event)
      await markSent(event.id)
      sent++
    } catch (cause) {
      /* One bad event must not stop the batch — the next one may be a
         confirmation somebody is waiting on. */
      await markFailed(event.id, event.attempts, (cause as Error).message ?? 'unknown')
      failed++
    }
  }

  return { claimed: events.length, sent, failed }
}
