import test from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, addUser, addDoctor } from './helpers.mjs'

/**
 * The rules the new schemas are supposed to guarantee.
 *
 * Written against the database rather than the action layer, because these are
 * constraints the engine enforces — if they only held in TypeScript, a second
 * caller could quietly break them.
 */

async function addSelf(db, userId, id = 'fam1', name = 'Aarav') {
  await db.query(
    `INSERT INTO patient.family_members (id, user_id, name, relation, is_self)
     VALUES ($1,$2,$3,'Self',true)`,
    [id, userId, name],
  )
}

async function addLead(db, id, status = 'NEW') {
  await db.query(
    `INSERT INTO clinic.surgery_leads (id, name, phone, procedure, status)
     VALUES ($1,'Rohit','9876543210','Cataract',$2)`,
    [id, status],
  )
}

/* ── family ──────────────────────────────────────────────────────────── */

test('an account can hold only one "self" row', async () => {
  const db = await freshDb()
  await addUser(db, 'u1', '9876543210')
  await addSelf(db, 'u1', 'fam1')

  await assert.rejects(() => addSelf(db, 'u1', 'fam2'), /duplicate key|unique/i)
  await db.close()
})

test('two different accounts each get their own "self" row', async () => {
  const db = await freshDb()
  await addUser(db, 'u1', '9876543210')
  await addUser(db, 'u2', '9876543211')
  await addSelf(db, 'u1', 'fam1')
  await addSelf(db, 'u2', 'fam2')

  const rows = await db.query('SELECT user_id FROM patient.family_members WHERE is_self')
  assert.equal(rows.length, 2)
  await db.close()
})

test('an account may hold many non-self members', async () => {
  const db = await freshDb()
  await addUser(db, 'u1', '9876543210')
  await addSelf(db, 'u1')
  for (const [id, name, relation] of [
    ['fam2', 'Priya', 'Spouse'],
    ['fam3', 'Ramesh', 'Father'],
  ]) {
    await db.query(
      `INSERT INTO patient.family_members (id, user_id, name, relation)
       VALUES ($1,'u1',$2,$3)`,
      [id, name, relation],
    )
  }

  const rows = await db.query('SELECT * FROM patient.family_members WHERE user_id = $1', ['u1'])
  assert.equal(rows.length, 3)
  await db.close()
})

test('deleting an account takes its family with it', async () => {
  const db = await freshDb()
  await addUser(db, 'u1', '9876543210')
  await addSelf(db, 'u1')

  await db.query('DELETE FROM patient.users WHERE id = $1', ['u1'])
  const rows = await db.query('SELECT * FROM patient.family_members')
  assert.equal(rows.length, 0)
  await db.close()
})

/* ── bookings across schemas ─────────────────────────────────────────── */

test('a booking can reference a doctor in another schema', async () => {
  const db = await freshDb()
  await addUser(db, 'u1', '9876543210')
  await addDoctor(db, 'doc1')
  await addSelf(db, 'u1')

  await db.query(
    `INSERT INTO patient.bookings (id, user_id, doctor_id, kind, slot, fee, status, patient_for)
     VALUES ('bk1','u1','doc1','clinic','Mon, 10:00 AM',600,'requested','fam1')`,
  )

  const row = await db.one(
    `SELECT b.id, d.name AS doctor, f.name AS seen_for
     FROM patient.bookings b
     JOIN provider.doctors d ON d.id = b.doctor_id
     JOIN patient.family_members f ON f.id = b.patient_for
     WHERE b.id = 'bk1'`,
  )
  assert.equal(row.doctor, 'Dr doc1')
  assert.equal(row.seen_for, 'Aarav')
  await db.close()
})

test('a booking cannot name a doctor that does not exist', async () => {
  const db = await freshDb()
  await addUser(db, 'u1', '9876543210')

  /* This is the guarantee that separate physical databases would have cost:
     across databases Postgres cannot check it at all. */
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO patient.bookings (id, user_id, doctor_id, kind, slot, fee)
         VALUES ('bk1','u1','ghost','clinic','Mon',600)`,
      ),
    /foreign key|violates/i,
  )
  await db.close()
})

/* ── surgery lead triage ─────────────────────────────────────────────── */

test('a referral must name a clinician or a centre', async () => {
  const db = await freshDb()
  await addLead(db, 'lead1')

  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO clinic.referrals (id, lead_id, kind) VALUES ('r1','lead1','doctor')`,
      ),
    /referral_has_a_destination|violates/i,
  )
  await db.close()
})

test('a diagnostic referral needs a centre, not a doctor', async () => {
  const db = await freshDb()
  await addLead(db, 'lead1')

  await db.query(
    `INSERT INTO clinic.referrals (id, lead_id, kind, centre_name)
     VALUES ('r1','lead1','diagnostic','Metropolis')`,
  )
  const rows = await db.query('SELECT * FROM clinic.referrals')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].centre_name, 'Metropolis')
  await db.close()
})

test('a lead only moves from the status it is actually in', async () => {
  const db = await freshDb()
  await addLead(db, 'lead1', 'NEW')

  const first = await db.query(
    `UPDATE clinic.surgery_leads SET status = 'APPROVED'
     WHERE id = 'lead1' AND status = 'NEW' RETURNING id`,
  )
  assert.equal(first.length, 1, 'the first approval succeeds')

  /* Two admins clicking approve: the second finds no row in state NEW, which
     is what stops a double approval rather than a check-then-write race. */
  const second = await db.query(
    `UPDATE clinic.surgery_leads SET status = 'APPROVED'
     WHERE id = 'lead1' AND status = 'NEW' RETURNING id`,
  )
  assert.equal(second.length, 0, 'the second approval matches nothing')
  await db.close()
})

test('referrals disappear with the lead they belong to', async () => {
  const db = await freshDb()
  await addLead(db, 'lead1')
  await db.query(
    `INSERT INTO clinic.referrals (id, lead_id, kind, centre_name)
     VALUES ('r1','lead1','diagnostic','Metropolis')`,
  )

  await db.query(`DELETE FROM clinic.surgery_leads WHERE id = 'lead1'`)
  assert.equal((await db.query('SELECT * FROM clinic.referrals')).length, 0)
  await db.close()
})

/* ── identity ────────────────────────────────────────────────────────── */

test('an account must be reachable by phone or email', async () => {
  const db = await freshDb()
  await assert.rejects(
    () => db.query(`INSERT INTO patient.users (id, name) VALUES ('u1','Nobody')`),
    /users_have_an_identifier|violates/i,
  )
  await db.close()
})

test('a Google account needs no phone number', async () => {
  const db = await freshDb()
  await db.query(
    `INSERT INTO patient.users (id, email, google_sub, name)
     VALUES ('u1','a@example.com','google-123','Asha')`,
  )
  const row = await db.one(`SELECT phone, email FROM patient.users WHERE id = 'u1'`)
  assert.equal(row.phone, null)
  assert.equal(row.email, 'a@example.com')
  await db.close()
})

test('one Google identity cannot be attached to two accounts', async () => {
  const db = await freshDb()
  await db.query(
    `INSERT INTO patient.users (id, email, google_sub, name)
     VALUES ('u1','a@example.com','google-123','Asha')`,
  )
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO patient.users (id, email, google_sub, name)
         VALUES ('u2','b@example.com','google-123','Someone else')`,
      ),
    /duplicate key|unique/i,
  )
  await db.close()
})
