import 'server-only'
import { getDb, ensureSchema } from './client'

/**
 * Appointment slots — the part of the system that has to be right under
 * concurrency.
 *
 * Until now a "slot" was a string the browser sent ("Today, 6:30 PM") and the
 * server stored verbatim. Two people could send the same string and both
 * succeed, because nothing anywhere represented the slot as a thing that can
 * be taken. These functions make it one.
 *
 * The state machine:
 *
 *   AVAILABLE --hold--> HELD --confirm--> BOOKED --> ATTENDED | NO_SHOW
 *       ^                 |
 *       +--release/TTL----+
 *
 * HELD exists because a clinic that cannot decline has no control over its own
 * calendar: the patient requests, the clinician answers. A hold that is never
 * answered expires rather than sterilising the slot forever.
 */

export type SlotStatus = 'AVAILABLE' | 'HELD' | 'BOOKED' | 'ATTENDED' | 'NO_SHOW'

export type Slot = {
  slot_id: string
  doctor_id: string
  slot_start: string
  slot_end: string
  kind: string
  status: SlotStatus
  locked_by: string | null
  locked_until: string | null
  version: number
}

/** How long a request may sit unanswered before the slot returns to the pool. */
export const HOLD_MINUTES = 120

async function db() {
  await ensureSchema()
  return getDb()
}

/* ── generation ──────────────────────────────────────────────────────── */

/** Consulting times offered by default, as minutes past midnight IST. */
const TEMPLATE = [
  9 * 60,
  9 * 60 + 30,
  10 * 60 + 15,
  11 * 60,
  12 * 60 + 30,
  13 * 60,
  14 * 60 + 15,
  17 * 60,
  17 * 60 + 45,
  18 * 60 + 30,
  19 * 60 + 15,
]

const SLOT_MINUTES = 15
/** India keeps a single timezone, so one fixed offset is correct here. */
const IST_OFFSET_MINUTES = 5 * 60 + 30

/**
 * Makes sure a doctor has slot rows for the next `days` days.
 *
 * Idempotent through the UNIQUE (doctor_id, slot_start) constraint, so calling
 * it when a profile is opened costs one no-op insert per slot rather than
 * requiring a scheduled job. A real clinic would define its own template; this
 * stands in until that screen exists.
 */
export async function ensureSlots(doctorId: string, days = 5): Promise<void> {
  const d = await db()

  const rows: string[] = []
  const params: unknown[] = []
  const now = new Date()

  for (let day = 0; day < days; day++) {
    for (const minutes of TEMPLATE) {
      /* Build the instant in UTC matching this IST wall time. */
      const midnight = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + day,
      )
      const start = new Date(midnight + (minutes - IST_OFFSET_MINUTES) * 60_000)
      if (start.getTime() < now.getTime()) continue

      const end = new Date(start.getTime() + SLOT_MINUTES * 60_000)
      const base = params.length
      rows.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`)
      params.push(
        `slot_${doctorId}_${start.getTime()}`,
        doctorId,
        start.toISOString(),
        end.toISOString(),
      )
    }
  }

  if (rows.length === 0) return

  await d.query(
    `INSERT INTO provider.appointment_slots (slot_id, doctor_id, slot_start, slot_end)
     VALUES ${rows.join(', ')}
     ON CONFLICT (doctor_id, slot_start) DO NOTHING`,
    params,
  )
}

/* ── reading ─────────────────────────────────────────────────────────── */

/**
 * Slots a patient may still choose.
 *
 * An expired hold counts as free: the row still says HELD, but nobody answered
 * in time, so showing it as taken would quietly shrink the clinic's calendar
 * every time a request went unanswered.
 */
export async function openSlots(doctorId: string, days = 5): Promise<Slot[]> {
  const d = await db()
  return d.query<Slot>(
    `SELECT * FROM provider.appointment_slots
     WHERE doctor_id = $1
       AND slot_start > now()
       AND slot_start < now() + ($2 || ' days')::interval
       AND (status = 'AVAILABLE' OR (status = 'HELD' AND locked_until < now()))
     ORDER BY slot_start`,
    [doctorId, String(days)],
  )
}

export async function findSlot(slotId: string): Promise<Slot | undefined> {
  const d = await db()
  return d.one<Slot>('SELECT * FROM provider.appointment_slots WHERE slot_id = $1', [slotId])
}

/* ── transitions ─────────────────────────────────────────────────────── */

/**
 * Take a slot for one patient. Returns false if somebody else got there first.
 *
 * This single statement is the whole concurrency guarantee. The WHERE clause
 * is not a check that runs before the write — Postgres locks the row and
 * re-evaluates the predicate at write time, so of two requests arriving
 * together exactly one can match `status = 'AVAILABLE'`; the other updates
 * nothing and gets no rows back.
 *
 * Reading the row first and then updating it would reintroduce the race this
 * table exists to close, which is why there is no `if (slot.status === ...)`
 * anywhere near this.
 */
export async function holdSlot(input: {
  slotId: string
  userId: string
  minutes?: number
}): Promise<boolean> {
  const d = await db()
  const rows = await d.query<{ slot_id: string }>(
    `UPDATE provider.appointment_slots
     SET status = 'HELD',
         locked_by = $2,
         locked_until = now() + ($3 || ' minutes')::interval,
         version = version + 1
     WHERE slot_id = $1
       AND (status = 'AVAILABLE' OR (status = 'HELD' AND locked_until < now()))
     RETURNING slot_id`,
    [input.slotId, input.userId, String(input.minutes ?? HOLD_MINUTES)],
  )
  return rows.length > 0
}

/** The clinician accepted: the hold becomes a booking. */
export async function confirmSlot(slotId: string): Promise<boolean> {
  const d = await db()
  const rows = await d.query<{ slot_id: string }>(
    `UPDATE provider.appointment_slots
     SET status = 'BOOKED', locked_until = NULL, version = version + 1
     WHERE slot_id = $1 AND status = 'HELD'
     RETURNING slot_id`,
    [slotId],
  )
  return rows.length > 0
}

/** Declined, cancelled, or swept: the slot goes back on sale. */
export async function releaseSlot(slotId: string): Promise<boolean> {
  const d = await db()
  const rows = await d.query<{ slot_id: string }>(
    `UPDATE provider.appointment_slots
     SET status = 'AVAILABLE', locked_by = NULL, locked_until = NULL, version = version + 1
     WHERE slot_id = $1 AND status IN ('HELD', 'BOOKED')
     RETURNING slot_id`,
    [slotId],
  )
  return rows.length > 0
}

/** After the appointment: seen, or did not turn up. */
export async function closeSlot(slotId: string, to: 'ATTENDED' | 'NO_SHOW'): Promise<boolean> {
  const d = await db()
  const rows = await d.query<{ slot_id: string }>(
    `UPDATE provider.appointment_slots
     SET status = $2, version = version + 1
     WHERE slot_id = $1 AND status = 'BOOKED'
     RETURNING slot_id`,
    [slotId, to],
  )
  return rows.length > 0
}

/**
 * Return every expired hold to the pool.
 *
 * openSlots already treats an expired hold as free, so this is housekeeping
 * rather than correctness — it keeps the table honest for anything reading
 * `status` directly, and gives a scheduled job something to call.
 */
export async function sweepExpiredHolds(): Promise<number> {
  const d = await db()
  const rows = await d.query<{ slot_id: string }>(
    `UPDATE provider.appointment_slots
     SET status = 'AVAILABLE', locked_by = NULL, locked_until = NULL, version = version + 1
     WHERE status = 'HELD' AND locked_until < now()
     RETURNING slot_id`,
  )
  return rows.length
}
