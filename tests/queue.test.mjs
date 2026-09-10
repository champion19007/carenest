import test from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, addDoctor, addUser } from './helpers.mjs'

/**
 * Live queue derivation.
 *
 * The queue is computed from slot state rather than stored, so these tests are
 * really about one question: does the number shown to a waiting patient follow
 * from facts the clinic actually produced? A stored "now serving" field would
 * need tests that it was kept updated; a derived one needs tests that the
 * derivation is right.
 */

/** Mirrors queueStatusFor, against the same SQL. */
async function queueStatus(db, bookingId, now = new Date()) {
  const booking = await db.one(
    'SELECT slot_id, doctor_id FROM patient.bookings WHERE id = $1',
    [bookingId],
  )
  if (!booking?.slot_id) return undefined

  const mine = await db.one(
    'SELECT slot_id, slot_start, status FROM provider.appointment_slots WHERE slot_id = $1',
    [booking.slot_id],
  )
  if (!mine) return undefined

  const sameDay = await db.query(
    `SELECT slot_id, slot_start, status FROM provider.appointment_slots
     WHERE doctor_id = $1 AND status IN ('BOOKED','ATTENDED')
       AND slot_start::date = $2::timestamptz::date
     ORDER BY slot_start`,
    [booking.doctor_id, mine.slot_start],
  )

  const nowMs = now.getTime()
  const scheduled = new Date(mine.slot_start).getTime()

  const inProgress = sameDay.find(
    (s) => s.status === 'BOOKED' && new Date(s.slot_start).getTime() <= nowMs,
  )
  const delayMs = inProgress ? Math.max(0, nowMs - new Date(inProgress.slot_start).getTime()) : 0

  const ahead = sameDay.filter(
    (s) =>
      s.status === 'BOOKED' &&
      new Date(s.slot_start).getTime() < scheduled &&
      s.slot_id !== mine.slot_id,
  ).length

  const estimated = Math.max(scheduled + delayMs, nowMs)

  return {
    ahead,
    delayMinutes: Math.round(delayMs / 60_000),
    estimatedStart: new Date(estimated).toISOString(),
    isNext: ahead === 0 && mine.status === 'BOOKED',
    isDone: mine.status === 'ATTENDED',
  }
}

/** A slot at an absolute instant, so tests do not race the clock. */
async function addSlotAt(db, slotId, doctorId, iso, status = 'BOOKED') {
  await db.query(
    `INSERT INTO provider.appointment_slots (slot_id, doctor_id, slot_start, slot_end, status)
     VALUES ($1,$2,$3,$3,$4)`,
    [slotId, doctorId, iso, status],
  )
}

async function addBooking(db, id, userId, doctorId, slotId) {
  await db.query(
    `INSERT INTO patient.bookings (id, user_id, doctor_id, slot_id, kind, slot, fee, status)
     VALUES ($1,$2,$3,$4,'clinic','x',600,'confirmed')`,
    [id, userId, doctorId, slotId],
  )
}

const DAY = '2030-06-01'
const at = (hhmm) => `${DAY}T${hhmm}:00Z`

async function clinic() {
  const db = await freshDb()
  await addDoctor(db, 'd1')
  await addUser(db, 'u1', '+919000000001')
  return db
}

test('a patient with three ahead is told three', async () => {
  const db = await clinic()
  await addSlotAt(db, 's1', 'd1', at('09:00'))
  await addSlotAt(db, 's2', 'd1', at('09:15'))
  await addSlotAt(db, 's3', 'd1', at('09:30'))
  await addSlotAt(db, 's4', 'd1', at('09:45'))
  await addBooking(db, 'b4', 'u1', 'd1', 's4')

  const status = await queueStatus(db, 'b4', new Date(at('08:50')))
  assert.equal(status.ahead, 3)
  assert.equal(status.isNext, false)
  await db.close()
})

test('patients already seen do not count as ahead', async () => {
  const db = await clinic()
  await addSlotAt(db, 's1', 'd1', at('09:00'), 'ATTENDED')
  await addSlotAt(db, 's2', 'd1', at('09:15'), 'ATTENDED')
  await addSlotAt(db, 's3', 'd1', at('09:30'))
  await addBooking(db, 'b3', 'u1', 'd1', 's3')

  const status = await queueStatus(db, 'b3', new Date(at('09:20')))
  assert.equal(status.ahead, 0)
  assert.equal(status.isNext, true)
  await db.close()
})

test('a clinic running late reports the delay', async () => {
  const db = await clinic()
  /* 09:00 should have been seen by now but is still BOOKED at 09:25, so the
     clinic is 25 minutes behind. */
  await addSlotAt(db, 's1', 'd1', at('09:00'))
  await addSlotAt(db, 's2', 'd1', at('09:30'))
  await addBooking(db, 'b2', 'u1', 'd1', 's2')

  const status = await queueStatus(db, 'b2', new Date(at('09:25')))
  assert.equal(status.delayMinutes, 25)
  assert.equal(Date.parse(status.estimatedStart), Date.parse(at('09:55')))
  await db.close()
})

test('a clinic on time reports no delay', async () => {
  const db = await clinic()
  await addSlotAt(db, 's1', 'd1', at('09:00'), 'ATTENDED')
  await addSlotAt(db, 's2', 'd1', at('09:30'))
  await addBooking(db, 'b2', 'u1', 'd1', 's2')

  const status = await queueStatus(db, 'b2', new Date(at('09:10')))
  assert.equal(status.delayMinutes, 0)
  assert.equal(Date.parse(status.estimatedStart), Date.parse(at('09:30')))
  await db.close()
})

test('an estimate is never in the past', async () => {
  const db = await clinic()
  await addSlotAt(db, 's1', 'd1', at('09:00'), 'ATTENDED')
  await addSlotAt(db, 's2', 'd1', at('09:15'))
  await addBooking(db, 'b2', 'u1', 'd1', 's2')

  /* Scheduled 09:15, nobody in progress, and it is already 10:00. Telling the
     patient "expected 09:15" would be worse than useless. */
  const status = await queueStatus(db, 'b2', new Date(at('10:00')))
  assert.ok(new Date(status.estimatedStart).getTime() >= new Date(at('10:00')).getTime())
  await db.close()
})

test('another doctor’s backlog does not delay this queue', async () => {
  const db = await clinic()
  await addDoctor(db, 'd2')
  await addSlotAt(db, 'other', 'd2', at('08:00'))
  await addSlotAt(db, 's1', 'd1', at('09:00'))
  await addBooking(db, 'b1', 'u1', 'd1', 's1')

  const status = await queueStatus(db, 'b1', new Date(at('08:55')))
  assert.equal(status.ahead, 0)
  assert.equal(status.delayMinutes, 0)
  await db.close()
})

test('yesterday’s appointments do not appear in today’s queue', async () => {
  const db = await clinic()
  await addSlotAt(db, 'old', 'd1', '2030-05-31T09:00:00Z')
  await addSlotAt(db, 's1', 'd1', at('09:00'))
  await addBooking(db, 'b1', 'u1', 'd1', 's1')

  const status = await queueStatus(db, 'b1', new Date(at('08:55')))
  assert.equal(status.ahead, 0)
  await db.close()
})

test('a completed consultation reports done', async () => {
  const db = await clinic()
  await addSlotAt(db, 's1', 'd1', at('09:00'), 'ATTENDED')
  await addBooking(db, 'b1', 'u1', 'd1', 's1')

  const status = await queueStatus(db, 'b1', new Date(at('09:20')))
  assert.equal(status.isDone, true)
  await db.close()
})

test('a booking with no slot has no queue position', async () => {
  const db = await clinic()
  await db.query(
    `INSERT INTO patient.bookings (id, user_id, doctor_id, kind, slot, fee, status)
     VALUES ('b0','u1','d1','clinic','Mon 10:00',600,'confirmed')`,
  )
  assert.equal(await queueStatus(db, 'b0'), undefined)
  await db.close()
})
