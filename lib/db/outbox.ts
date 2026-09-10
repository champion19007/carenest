import 'server-only'
import { getDb, ensureSchema } from './client'

/**
 * Transactional outbox.
 *
 * Notifications used to go out inline from the server action. If the SMS
 * gateway was slow the patient waited for it; if it was down the booking still
 * committed and nobody was ever told, with nothing to retry. Both failures are
 * invisible from the screen that caused them.
 *
 * Recording the intent as a row instead splits the two concerns: the booking
 * and the promise to notify commit together, and delivery becomes a separate
 * job that is allowed to fail and be tried again.
 *
 * Delivery is at-least-once, not exactly-once. A worker can send a message and
 * die before marking the row sent, and the next drain will send it again. That
 * is the right trade here — a patient receiving a duplicate confirmation is a
 * nuisance, whereas never being told their appointment is confirmed is a
 * missed appointment. Handlers should be written expecting it.
 */

export type DomainEvent = {
  id: number
  kind: string
  subject_id: string | null
  payload: Record<string, unknown>
  status: 'PENDING' | 'SENT' | 'FAILED'
  attempts: number
  last_error: string | null
  available_at: string
  created_at: string
}

/** Give up after this many tries and leave the row for a human to look at. */
const MAX_ATTEMPTS = 5
/** How long a worker may hold a claimed row before another may retry it. */
const CLAIM_MINUTES = 5

async function db() {
  await ensureSchema()
  return getDb()
}

/**
 * Record that something happened and a message should follow.
 *
 * Cheap on purpose: one insert, no network. Whatever wrote the booking is
 * still holding the user's request, and this must not add a third-party call
 * to that path — which is the entire point of the pattern.
 */
export async function emit(input: {
  kind: string
  subjectId?: string | null
  payload?: Record<string, unknown>
}): Promise<void> {
  const d = await db()
  await d.query(
    `INSERT INTO domain_events (kind, subject_id, payload)
     VALUES ($1, $2, $3::jsonb)`,
    [input.kind, input.subjectId ?? null, JSON.stringify(input.payload ?? {})],
  )
}

/**
 * Claim a batch of due events.
 *
 * The claim is the same conditional-UPDATE trick the slot engine uses: the
 * rows are selected and locked in one statement, so two drains running at once
 * cannot both take the same event. `FOR UPDATE SKIP LOCKED` means the second
 * worker moves on to other rows instead of waiting behind the first.
 */
export async function claimBatch(limit = 20): Promise<DomainEvent[]> {
  const d = await db()
  const rows = await d.query<DomainEvent>(
    `UPDATE domain_events
     SET locked_until = now() + ($2 || ' minutes')::interval,
         attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM domain_events
       WHERE status = 'PENDING'
         AND available_at <= now()
         AND (locked_until IS NULL OR locked_until < now())
       ORDER BY available_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [limit, String(CLAIM_MINUTES)],
  )
  return rows.map(normalise)
}

export async function markSent(id: number): Promise<void> {
  const d = await db()
  await d.query(
    `UPDATE domain_events SET status = 'SENT', locked_until = NULL WHERE id = $1`,
    [id],
  )
}

/**
 * Delivery failed. Back off and try later, or give up and leave it visible.
 *
 * Exponential rather than fixed: a gateway that is down stays down for
 * minutes, and retrying every few seconds turns one outage into a stampede
 * against a service already in trouble.
 */
export async function markFailed(id: number, attempts: number, error: string): Promise<void> {
  const d = await db()

  if (attempts >= MAX_ATTEMPTS) {
    await d.query(
      `UPDATE domain_events
       SET status = 'FAILED', locked_until = NULL, last_error = $2
       WHERE id = $1`,
      [id, error.slice(0, 500)],
    )
    return
  }

  const backoffMinutes = Math.min(2 ** attempts, 60)
  await d.query(
    `UPDATE domain_events
     SET locked_until = NULL,
         last_error = $2,
         available_at = now() + ($3 || ' minutes')::interval
     WHERE id = $1`,
    [id, error.slice(0, 500), String(backoffMinutes)],
  )
}

/** Events that ran out of attempts — the queue a person should look at. */
export async function deadLetters(limit = 50): Promise<DomainEvent[]> {
  const d = await db()
  const rows = await d.query<DomainEvent>(
    `SELECT * FROM domain_events WHERE status = 'FAILED'
     ORDER BY created_at DESC LIMIT $1`,
    [limit],
  )
  return rows.map(normalise)
}

export async function pendingCount(): Promise<number> {
  const d = await db()
  const row = await d.one<{ n: string }>(
    `SELECT COUNT(*) AS n FROM domain_events WHERE status = 'PENDING'`,
  )
  return Number(row?.n ?? 0)
}

function normalise(row: DomainEvent): DomainEvent {
  return {
    ...row,
    attempts: Number(row.attempts),
    payload:
      typeof row.payload === 'string'
        ? (JSON.parse(row.payload) as Record<string, unknown>)
        : (row.payload ?? {}),
  }
}

export { MAX_ATTEMPTS, CLAIM_MINUTES }
