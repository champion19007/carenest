import test from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, addDoctor, addUser } from './helpers.mjs'

/**
 * Slot concurrency.
 *
 * A caveat worth stating: PGlite runs one connection, so two "simultaneous"
 * calls here are serialised rather than genuinely parallel. That does not
 * weaken these tests, because the mutual exclusion is not implemented in
 * JavaScript — it is a single conditional UPDATE, and Postgres re-evaluates
 * the predicate under a row lock at write time. What these tests verify is
 * that the predicate is the right one. Had the code read the row and then
 * written it, no test on a single connection could have caught the race.
 */

const HOLD = 120

async function addSlot(db, slotId, doctorId, minutesFromNow = 60, status = 'AVAILABLE') {
  await db.query(
    `INSERT INTO provider.appointment_slots
       (slot_id, doctor_id, slot_start, slot_end, status)
     VALUES ($1, $2, now() + ($3 || ' minutes')::interval,
             now() + (($3::int + 15) || ' minutes')::interval, $4)`,
    [slotId, doctorId, String(minutesFromNow), status],
  )
}

async function hold(db, slotId, userId, minutes = HOLD) {
  const rows = await db.query(
    `UPDATE provider.appointment_slots
     SET status = 'HELD', locked_by = $2,
         locked_until = now() + ($3 || ' minutes')::interval,
         version = version + 1
     WHERE slot_id = $1
       AND (status = 'AVAILABLE' OR (status = 'HELD' AND locked_until < now()))
     RETURNING slot_id`,
    [slotId, userId, String(minutes)],
  )
  return rows.length > 0
}

async function confirm(db, slotId) {
  const rows = await db.query(
    `UPDATE provider.appointment_slots
     SET status = 'BOOKED', locked_until = NULL, version = version + 1
     WHERE slot_id = $1 AND status = 'HELD' RETURNING slot_id`,
    [slotId],
  )
  return rows.length > 0
}

async function release(db, slotId) {
  const rows = await db.query(
    `UPDATE provider.appointment_slots
     SET status = 'AVAILABLE', locked_by = NULL, locked_until = NULL, version = version + 1
     WHERE slot_id = $1 AND status IN ('HELD','BOOKED') RETURNING slot_id`,
    [slotId],
  )
  return rows.length > 0
}

async function sweep(db) {
  const rows = await db.query(
    `UPDATE provider.appointment_slots
     SET status = 'AVAILABLE', locked_by = NULL, locked_until = NULL, version = version + 1
     WHERE status = 'HELD' AND locked_until < now() RETURNING slot_id`,
  )
  return rows.length
}

async function statusOf(db, slotId) {
  const row = await db.one('SELECT * FROM provider.appointment_slots WHERE slot_id = $1', [slotId])
  return row
}

async function fixture() {
  const db = await freshDb()
  await addDoctor(db, 'd1')
  await addUser(db, 'u1', '+919000000001')
  await addUser(db, 'u2', '+919000000002')
  await addSlot(db, 's1', 'd1')
  return db
}

test('two people cannot hold the same slot', async () => {
  const db = await fixture()

  const results = await Promise.all([hold(db, 's1', 'u1'), hold(db, 's1', 'u2')])
  assert.equal(results.filter(Boolean).length, 1, 'exactly one hold must succeed')

  const slot = await statusOf(db, 's1')
  assert.equal(slot.status, 'HELD')
  await db.close()
})

test('the loser of a race is told, not silently ignored', async () => {
  const db = await fixture()
  assert.equal(await hold(db, 's1', 'u1'), true)
  assert.equal(await hold(db, 's1', 'u2'), false)
  await db.close()
})

test('a held slot is no longer offered', async () => {
  const db = await fixture()
  await hold(db, 's1', 'u1')

  const open = await db.query(
    `SELECT * FROM provider.appointment_slots
     WHERE doctor_id = 'd1' AND slot_start > now()
       AND (status = 'AVAILABLE' OR (status = 'HELD' AND locked_until < now()))`,
  )
  assert.equal(open.length, 0)
  await db.close()
})

test('an expired hold returns to the pool without a sweep', async () => {
  const db = await fixture()
  /* A hold that expired an hour ago. */
  await hold(db, 's1', 'u1', -60)

  const open = await db.query(
    `SELECT * FROM provider.appointment_slots
     WHERE doctor_id = 'd1' AND slot_start > now()
       AND (status = 'AVAILABLE' OR (status = 'HELD' AND locked_until < now()))`,
  )
  assert.equal(open.length, 1, 'an unanswered request must not sterilise the slot')

  /* And somebody else can now take it. */
  assert.equal(await hold(db, 's1', 'u2', HOLD), true)
  assert.equal((await statusOf(db, 's1')).locked_by, 'u2')
  await db.close()
})

test('a live hold cannot be stolen', async () => {
  const db = await fixture()
  await hold(db, 's1', 'u1')
  assert.equal(await hold(db, 's1', 'u2'), false)
  assert.equal((await statusOf(db, 's1')).locked_by, 'u1')
  await db.close()
})

test('confirm only applies to a held slot', async () => {
  const db = await fixture()
  assert.equal(await confirm(db, 's1'), false, 'an available slot was never requested')

  await hold(db, 's1', 'u1')
  assert.equal(await confirm(db, 's1'), true)
  assert.equal((await statusOf(db, 's1')).status, 'BOOKED')

  /* A replayed accept must not transition twice. */
  assert.equal(await confirm(db, 's1'), false)
  await db.close()
})

test('declining puts the slot back on sale', async () => {
  const db = await fixture()
  await hold(db, 's1', 'u1')
  assert.equal(await release(db, 's1'), true)

  const slot = await statusOf(db, 's1')
  assert.equal(slot.status, 'AVAILABLE')
  assert.equal(slot.locked_by, null)
  assert.equal(await hold(db, 's1', 'u2'), true, 'someone else can now take it')
  await db.close()
})

test('a booked slot cannot be held by anyone else', async () => {
  const db = await fixture()
  await hold(db, 's1', 'u1')
  await confirm(db, 's1')
  assert.equal(await hold(db, 's1', 'u2'), false)
  await db.close()
})

test('the sweep frees only expired holds', async () => {
  const db = await fixture()
  await addSlot(db, 's2', 'd1', 120)
  await hold(db, 's1', 'u1', -60) // expired
  await hold(db, 's2', 'u2', HOLD) // live

  assert.equal(await sweep(db), 1)
  assert.equal((await statusOf(db, 's1')).status, 'AVAILABLE')
  assert.equal((await statusOf(db, 's2')).status, 'HELD')
  await db.close()
})

test('version increments on every transition', async () => {
  const db = await fixture()
  assert.equal((await statusOf(db, 's1')).version, 0)

  await hold(db, 's1', 'u1')
  assert.equal((await statusOf(db, 's1')).version, 1)

  await confirm(db, 's1')
  assert.equal((await statusOf(db, 's1')).version, 2)

  await release(db, 's1')
  assert.equal((await statusOf(db, 's1')).version, 3)
  await db.close()
})

test('one doctor cannot have two slots at the same instant', async () => {
  const db = await fixture()

  /* An explicit instant, not `now() + interval`: two calls to now() land
     milliseconds apart, so they would never collide and the test would pass
     while proving nothing about the constraint. */
  const at = '2030-01-01T09:00:00Z'
  const insert = (slotId) =>
    db.query(
      `INSERT INTO provider.appointment_slots (slot_id, doctor_id, slot_start, slot_end)
       VALUES ($1, 'd1', $2, $2)`,
      [slotId, at],
    )

  await insert('s-a')
  await assert.rejects(() => insert('s-b'), /unique|duplicate/i)
  await db.close()
})
