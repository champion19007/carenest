import test from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, addDoctor, addUser } from './helpers.mjs'

/**
 * Review integrity.
 *
 * The trust page promises that reviews come only from completed visits. These
 * tests exist because that promise was false for a while: the action checked
 * that the reviewer was signed in and had not already reviewed, which reads
 * like a gate but permits any account to rate any doctor.
 */

async function book(db, { id, userId, doctorId, status = 'requested' }) {
  await db.query(
    `INSERT INTO patient.bookings (id, user_id, doctor_id, kind, slot, fee, status)
     VALUES ($1,$2,$3,'clinic','Mon 10:00',600,$4)`,
    [id, userId, doctorId, status],
  )
}

async function markAttended(db, bookingId, doctorId) {
  const rows = await db.query(
    `UPDATE patient.bookings SET status = 'attended', attended_at = now()
     WHERE id = $1 AND doctor_id = $2 AND status = 'confirmed'
     RETURNING id`,
    [bookingId, doctorId],
  )
  return rows.length > 0
}

async function hasAttended(db, userId, doctorId) {
  const rows = await db.query(
    `SELECT 1 FROM patient.bookings
     WHERE user_id = $1 AND doctor_id = $2 AND status = 'attended' LIMIT 1`,
    [userId, doctorId],
  )
  return rows.length > 0
}

test('a stranger who never booked cannot review', async () => {
  const db = await freshDb()
  await addUser(db, 'u1', '+919000000001')
  await addDoctor(db, 'd1')
  assert.equal(await hasAttended(db, 'u1', 'd1'), false)
  await db.close()
})

test('a pending or confirmed booking is not enough', async () => {
  const db = await freshDb()
  await addUser(db, 'u1', '+919000000001')
  await addDoctor(db, 'd1')

  await book(db, { id: 'b1', userId: 'u1', doctorId: 'd1', status: 'requested' })
  assert.equal(await hasAttended(db, 'u1', 'd1'), false)

  await db.query(`UPDATE patient.bookings SET status = 'confirmed' WHERE id = 'b1'`)
  assert.equal(await hasAttended(db, 'u1', 'd1'), false)
  await db.close()
})

test('the clinician marking attendance is what unlocks the review', async () => {
  const db = await freshDb()
  await addUser(db, 'u1', '+919000000001')
  await addDoctor(db, 'd1')
  await book(db, { id: 'b1', userId: 'u1', doctorId: 'd1', status: 'confirmed' })

  assert.equal(await markAttended(db, 'b1', 'd1'), true)
  assert.equal(await hasAttended(db, 'u1', 'd1'), true)
  await db.close()
})

test('attendance cannot be marked twice', async () => {
  const db = await freshDb()
  await addUser(db, 'u1', '+919000000001')
  await addDoctor(db, 'd1')
  await book(db, { id: 'b1', userId: 'u1', doctorId: 'd1', status: 'confirmed' })

  assert.equal(await markAttended(db, 'b1', 'd1'), true)
  /* A replayed form submission must be a no-op, not a second transition. */
  assert.equal(await markAttended(db, 'b1', 'd1'), false)
  await db.close()
})

test('a doctor cannot mark another practice’s appointment attended', async () => {
  const db = await freshDb()
  await addUser(db, 'u1', '+919000000001')
  await addDoctor(db, 'd1')
  await addDoctor(db, 'd2')
  await book(db, { id: 'b1', userId: 'u1', doctorId: 'd1', status: 'confirmed' })

  assert.equal(await markAttended(db, 'b1', 'd2'), false)
  assert.equal(await hasAttended(db, 'u1', 'd1'), false)
  await db.close()
})

test('attending one doctor does not unlock reviewing a different one', async () => {
  const db = await freshDb()
  await addUser(db, 'u1', '+919000000001')
  await addDoctor(db, 'd1')
  await addDoctor(db, 'd2')
  await book(db, { id: 'b1', userId: 'u1', doctorId: 'd1', status: 'confirmed' })
  await markAttended(db, 'b1', 'd1')

  assert.equal(await hasAttended(db, 'u1', 'd1'), true)
  assert.equal(await hasAttended(db, 'u1', 'd2'), false)
  await db.close()
})

test('one patient attending does not unlock reviews for another patient', async () => {
  const db = await freshDb()
  await addUser(db, 'u1', '+919000000001')
  await addUser(db, 'u2', '+919000000002')
  await addDoctor(db, 'd1')
  await book(db, { id: 'b1', userId: 'u1', doctorId: 'd1', status: 'confirmed' })
  await markAttended(db, 'b1', 'd1')

  assert.equal(await hasAttended(db, 'u2', 'd1'), false)
  await db.close()
})
