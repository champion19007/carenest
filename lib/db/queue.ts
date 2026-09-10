import 'server-only'
import { getDb, ensureSchema } from './client'

/**
 * The live queue.
 *
 * Booking online in most Indian clinics buys a token, not a time: you arrive,
 * you wait, and the only person who knows how far behind the doctor is running
 * is the receptionist. This turns that into a number the patient can see from
 * home.
 *
 * Everything here is *derived* from slot state rather than stored. There is no
 * "currently serving" field for a clinic to keep updated, because a field like
 * that is only ever as accurate as the busiest person in the room remembers to
 * make it — and a queue display that is quietly stale is worse than none, since
 * a patient will trust it and miss their turn. The inputs are facts the clinic
 * already produces for other reasons: a slot is BOOKED, and the clinician marks
 * it ATTENDED to unlock the patient's review.
 */

const CONSULT_MINUTES = 15
/** How early we ask someone to arrive, so the clinic is never left waiting. */
const ARRIVE_EARLY_MINUTES = 10

export type QueueStatus = {
  /** How many booked appointments are still ahead of this one today. */
  ahead: number
  /** Minutes the clinic is currently running behind its printed times. */
  delayMinutes: number
  /** When we now expect this consultation to start. */
  estimatedStart: string
  /** When the patient should be at the clinic. */
  arriveBy: string
  /** Scheduled time, kept so the UI can show a change honestly. */
  scheduledStart: string
  /** True once this patient is the next one in. */
  isNext: boolean
  /** True once the clinician has marked this appointment attended. */
  isDone: boolean
}

type SlotRow = {
  slot_id: string
  slot_start: string
  status: string
}

async function db() {
  await ensureSchema()
  return getDb()
}

/**
 * Queue position for one booking.
 *
 * Returns undefined when the booking has no slot, is not for today, or was
 * never confirmed — all cases where a queue position would be meaningless
 * rather than zero.
 */
export async function queueStatusFor(bookingId: string): Promise<QueueStatus | undefined> {
  const d = await db()

  const booking = await d.one<{ slot_id: string | null; doctor_id: string }>(
    'SELECT slot_id, doctor_id FROM patient.bookings WHERE id = $1',
    [bookingId],
  )
  if (!booking?.slot_id) return undefined

  const mine = await d.one<SlotRow>(
    'SELECT slot_id, slot_start, status FROM provider.appointment_slots WHERE slot_id = $1',
    [booking.slot_id],
  )
  if (!mine) return undefined

  /* Only today's list matters. Yesterday's delay tells you nothing, and
     tomorrow's queue has not begun. */
  const sameDay = await d.query<SlotRow>(
    `SELECT slot_id, slot_start, status
     FROM provider.appointment_slots
     WHERE doctor_id = $1
       AND status IN ('BOOKED', 'ATTENDED')
       AND slot_start::date = $2::timestamptz::date
     ORDER BY slot_start`,
    [booking.doctor_id, mine.slot_start],
  )

  const now = Date.now()
  const scheduled = new Date(mine.slot_start).getTime()

  /* The consultation in progress is the earliest booked-but-not-attended slot
     whose scheduled time has already passed. How late it is running is how
     late the whole rest of the day is running. */
  const inProgress = sameDay.find(
    (slot) => slot.status === 'BOOKED' && new Date(slot.slot_start).getTime() <= now,
  )

  const delayMs = inProgress
    ? Math.max(0, now - new Date(inProgress.slot_start).getTime())
    : 0

  const ahead = sameDay.filter(
    (slot) =>
      slot.status === 'BOOKED' &&
      new Date(slot.slot_start).getTime() < scheduled &&
      slot.slot_id !== mine.slot_id,
  ).length

  /* Never estimate a start in the past: if the clinic is behind, the honest
     answer is "as soon as the queue reaches you", not a time already gone. */
  const estimated = Math.max(scheduled + delayMs, now)
  const arriveBy = estimated - ARRIVE_EARLY_MINUTES * 60_000

  return {
    ahead,
    delayMinutes: Math.round(delayMs / 60_000),
    estimatedStart: new Date(estimated).toISOString(),
    arriveBy: new Date(arriveBy).toISOString(),
    scheduledStart: mine.slot_start,
    isNext: ahead === 0 && mine.status === 'BOOKED',
    isDone: mine.status === 'ATTENDED',
  }
}

/**
 * The clinic-side view: who is waiting, in order.
 *
 * Used by the practice app so the clinician sees the same queue the patients
 * are watching, rather than a different one.
 */
export async function queueForDoctor(doctorId: string) {
  const d = await db()
  return d.query<{
    slot_id: string
    slot_start: string
    status: string
    booking_id: string | null
    patient_name: string | null
  }>(
    `SELECT s.slot_id, s.slot_start, s.status,
            b.id AS booking_id,
            COALESCE(f.name, u.name) AS patient_name
     FROM provider.appointment_slots s
     LEFT JOIN patient.bookings b ON b.slot_id = s.slot_id
     LEFT JOIN patient.users u ON u.id = b.user_id
     LEFT JOIN patient.family_members f ON f.id = b.patient_for
     WHERE s.doctor_id = $1
       AND s.status IN ('BOOKED', 'ATTENDED')
       AND s.slot_start::date = now()::date
     ORDER BY s.slot_start`,
    [doctorId],
  )
}

export { CONSULT_MINUTES, ARRIVE_EARLY_MINUTES }
