import test from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, addDoctor, addUser } from './helpers.mjs'

/**
 * Transactional outbox, and the cascade audit that came with it.
 *
 * The property being protected is that a promise to notify somebody survives
 * everything that can go wrong after the booking commits — a gateway outage,
 * a killed function, two workers racing.
 */

const CLAIM_MINUTES = 5
const MAX_ATTEMPTS = 5

async function emit(db, kind, subjectId = null, payload = {}) {
  await db.query(
    `INSERT INTO domain_events (kind, subject_id, payload) VALUES ($1,$2,$3::jsonb)`,
    [kind, subjectId, JSON.stringify(payload)],
  )
}

async function claim(db, limit = 20) {
  return db.query(
    `UPDATE domain_events
     SET locked_until = now() + ($2 || ' minutes')::interval, attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM domain_events
       WHERE status = 'PENDING' AND available_at <= now()
         AND (locked_until IS NULL OR locked_until < now())
       ORDER BY available_at LIMIT $1 FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [limit, String(CLAIM_MINUTES)],
  )
}

async function markSent(db, id) {
  await db.query(`UPDATE domain_events SET status='SENT', locked_until=NULL WHERE id=$1`, [id])
}

async function markFailed(db, id, attempts, error) {
  if (attempts >= MAX_ATTEMPTS) {
    await db.query(
      `UPDATE domain_events SET status='FAILED', locked_until=NULL, last_error=$2 WHERE id=$1`,
      [id, error],
    )
    return
  }
  const backoff = Math.min(2 ** attempts, 60)
  await db.query(
    `UPDATE domain_events
     SET locked_until=NULL, last_error=$2, available_at = now() + ($3 || ' minutes')::interval
     WHERE id=$1`,
    [id, error, String(backoff)],
  )
}

test('an emitted event is pending and claimable', async () => {
  const db = await freshDb()
  await emit(db, 'booking.requested', 'b1', { phone: '9000000001' })

  const claimed = await claim(db)
  assert.equal(claimed.length, 1)
  assert.equal(claimed[0].kind, 'booking.requested')
  assert.equal(Number(claimed[0].attempts), 1, 'claiming counts as an attempt')
  await db.close()
})

test('a claimed event is not handed to a second worker', async () => {
  const db = await freshDb()
  await emit(db, 'booking.requested', 'b1')

  const first = await claim(db)
  const second = await claim(db)
  assert.equal(first.length, 1)
  assert.equal(second.length, 0, 'the claim must hold for its lease')
  await db.close()
})

test('a lease that expires makes the event claimable again', async () => {
  const db = await freshDb()
  await emit(db, 'booking.requested', 'b1')
  await claim(db)

  /* The worker that claimed it died without marking it either way. */
  await db.query(`UPDATE domain_events SET locked_until = now() - interval '1 minute'`)

  const retry = await claim(db)
  assert.equal(retry.length, 1, 'a dead worker must not strand the message')
  assert.equal(Number(retry[0].attempts), 2)
  await db.close()
})

test('a sent event is never claimed again', async () => {
  const db = await freshDb()
  await emit(db, 'booking.requested', 'b1')
  const [event] = await claim(db)
  await markSent(db, event.id)

  await db.query(`UPDATE domain_events SET locked_until = NULL`)
  assert.equal((await claim(db)).length, 0)
  await db.close()
})

test('a failure backs off rather than retrying immediately', async () => {
  const db = await freshDb()
  await emit(db, 'booking.requested', 'b1')
  const [event] = await claim(db)
  await markFailed(db, event.id, Number(event.attempts), 'gateway down')

  /* Still PENDING, but not due yet — retrying a downed gateway every second
     turns one outage into a stampede. */
  const row = await db.one('SELECT * FROM domain_events WHERE id=$1', [event.id])
  assert.equal(row.status, 'PENDING')
  assert.equal(row.last_error, 'gateway down')
  assert.equal((await claim(db)).length, 0, 'must not be due immediately')
  await db.close()
})

test('backoff grows with each attempt', async () => {
  const db = await freshDb()
  await emit(db, 'booking.requested', 'b1')

  const due = async () => {
    const row = await db.one('SELECT available_at FROM domain_events LIMIT 1')
    return new Date(row.available_at).getTime()
  }

  const [first] = await claim(db)
  await markFailed(db, first.id, 1, 'x')
  const afterOne = await due()

  await db.query(`UPDATE domain_events SET available_at = now(), locked_until = NULL`)
  const [second] = await claim(db)
  await markFailed(db, second.id, 3, 'x')
  const afterThree = await due()

  assert.ok(afterThree > afterOne, 'a later attempt must wait longer')
  await db.close()
})

test('an event gives up after the attempt limit and stays visible', async () => {
  const db = await freshDb()
  await emit(db, 'booking.requested', 'b1')
  const [event] = await claim(db)
  await markFailed(db, event.id, MAX_ATTEMPTS, 'permanently broken')

  const row = await db.one('SELECT * FROM domain_events WHERE id=$1', [event.id])
  assert.equal(row.status, 'FAILED')
  assert.equal(row.last_error, 'permanently broken')

  const dead = await db.query(`SELECT * FROM domain_events WHERE status='FAILED'`)
  assert.equal(dead.length, 1, 'a dead letter must remain findable')
  await db.close()
})

test('events are drained oldest first', async () => {
  const db = await freshDb()
  await emit(db, 'first', 'a')
  await db.query(`UPDATE domain_events SET available_at = now() - interval '10 minutes'`)
  await emit(db, 'second', 'b')

  const claimed = await claim(db, 2)
  assert.equal(claimed[0].kind, 'first')
  await db.close()
})

test('an event survives deletion of what it refers to', async () => {
  const db = await freshDb()
  await addUser(db, 'u1', '+919000000001')
  await emit(db, 'booking.confirmed', 'u1', { phone: '9000000001' })

  /* No foreign key on purpose: a confirmation already promised must still be
     sendable, and diagnosable, after the row it names is gone. */
  await db.query(`DELETE FROM patient.users WHERE id = 'u1'`)
  assert.equal((await claim(db)).length, 1)
  await db.close()
})

/* ── the cascade audit ──────────────────────────────────────────────── */

test('the audit log survives erasure of the account it names', async () => {
  const db = await freshDb()
  await addUser(db, 'u1', '+919000000001')
  await db.query(
    `INSERT INTO audit_log (actor_id, actor_role, action, resource, tenant_region, detail)
     VALUES ('u1','patient','record:read','u1','IN-MH','{}')`,
  )

  await db.query(`DELETE FROM patient.users WHERE id = 'u1'`)

  const rows = await db.query('SELECT * FROM audit_log')
  assert.equal(rows.length, 1, 'erasing an account must not destroy who read what')
  assert.equal(rows[0].actor_id, 'u1')
  await db.close()
})

test('a doctor with status history cannot be deleted out from under it', async () => {
  const db = await freshDb()
  await addDoctor(db, 'd1')
  await db.query(
    `INSERT INTO provider.status_history (id, doctor_id, from_status, to_status, reason)
     VALUES ('h1','d1','PENDING','ACTIVE','council number verified')`,
  )

  await assert.rejects(
    () => db.query(`DELETE FROM provider.doctors WHERE id = 'd1'`),
    /RESTRICT|violates foreign key/i,
  )
  assert.equal((await db.query('SELECT 1 FROM provider.status_history')).length, 1)
  await db.close()
})

test('verification documents outlive the listing they justified', async () => {
  const db = await freshDb()
  await addDoctor(db, 'd1')
  await db.query(
    `INSERT INTO provider.documents (id, doctor_id, doc_type, blob_url)
     VALUES ('doc1','d1','registration','https://example.test/x.pdf')`,
  )

  await assert.rejects(
    () => db.query(`DELETE FROM provider.doctors WHERE id = 'd1'`),
    /RESTRICT|violates foreign key/i,
  )
  await db.close()
})
