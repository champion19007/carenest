import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { freshDb, addUser } from './helpers.mjs'

/**
 * Estimate immutability.
 *
 * The promise made to the patient is not that the price cannot change — a
 * clinic may legitimately re-price after seeing a scan. It is that a change
 * cannot be made quietly. So these tests are about what happens when someone
 * tries to alter a number after it was agreed.
 */

function hashEstimate({ procedure, hospital, roomTier, lineItems }) {
  const canonical = JSON.stringify({
    procedure: procedure.trim(),
    hospital: hospital.trim(),
    roomTier: roomTier.trim(),
    lineItems: lineItems.map((i) => [i.label.trim(), Math.round(i.amount)]),
  })
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32)
}

const ITEMS = [
  { label: 'Surgeon fee', amount: 35000 },
  { label: 'Anaesthesia', amount: 12000 },
  { label: 'Room rent — General ward, 1 night', amount: 4000 },
  { label: 'Consumables', amount: 6500 },
]

async function addLead(db, id, userId = null) {
  await db.query(
    `INSERT INTO clinic.surgery_leads (id, user_id, name, phone, city, procedure)
     VALUES ($1,$2,'Aarav Sharma','+919000000001','Navi Mumbai','Hernia repair')`,
    [id, userId],
  )
}

async function issue(db, id, leadId, lineItems = ITEMS, supersedes = null) {
  const total = lineItems.reduce((s, i) => s + Math.round(i.amount), 0)
  const hash = hashEstimate({
    procedure: 'Hernia repair',
    hospital: 'Sunrise Multispeciality',
    roomTier: 'General ward',
    lineItems,
  })
  const rows = await db.query(
    `INSERT INTO clinic.estimates
       (id, lead_id, procedure, hospital, room_tier, line_items, total, content_hash, supersedes)
     VALUES ($1,$2,'Hernia repair','Sunrise Multispeciality','General ward',$3::jsonb,$4,$5,$6)
     RETURNING *`,
    [id, leadId, JSON.stringify(lineItems), total, hash, supersedes],
  )
  return rows[0]
}

test('an estimate totals its line items', async () => {
  const db = await freshDb()
  await addLead(db, 'l1')
  const estimate = await issue(db, 'e1', 'l1')
  assert.equal(Number(estimate.total), 57500)
  await db.close()
})

test('an issued estimate cannot be edited', async () => {
  const db = await freshDb()
  await addLead(db, 'l1')
  await issue(db, 'e1', 'l1')

  await assert.rejects(
    () => db.query(`UPDATE clinic.estimates SET total = 90000 WHERE id = 'e1'`),
    /cannot be UPDATE|supersede/i,
  )

  const row = await db.one(`SELECT total FROM clinic.estimates WHERE id = 'e1'`)
  assert.equal(Number(row.total), 57500)
  await db.close()
})

test('an issued estimate cannot be deleted', async () => {
  const db = await freshDb()
  await addLead(db, 'l1')
  await issue(db, 'e1', 'l1')

  await assert.rejects(
    () => db.query(`DELETE FROM clinic.estimates WHERE id = 'e1'`),
    /cannot be DELETE|supersede/i,
  )
  assert.equal((await db.query('SELECT 1 FROM clinic.estimates')).length, 1)
  await db.close()
})

test('a re-price supersedes rather than overwrites', async () => {
  const db = await freshDb()
  await addLead(db, 'l1')
  await issue(db, 'e1', 'l1')

  const dearer = [...ITEMS, { label: 'Mesh implant', amount: 18000 }]
  await issue(db, 'e2', 'l1', dearer, 'e1')

  const all = await db.query(
    `SELECT id, total, supersedes FROM clinic.estimates WHERE lead_id = 'l1' ORDER BY created_at`,
  )
  assert.equal(all.length, 2, 'the original must still be readable')
  assert.equal(Number(all[0].total), 57500)
  assert.equal(Number(all[1].total), 75500)
  assert.equal(all[1].supersedes, 'e1')
  await db.close()
})

test('the current estimate is the one nothing supersedes', async () => {
  const db = await freshDb()
  await addLead(db, 'l1')
  await issue(db, 'e1', 'l1')
  await issue(db, 'e2', 'l1', ITEMS, 'e1')

  const all = await db.query(`SELECT id, supersedes FROM clinic.estimates WHERE lead_id = 'l1'`)
  const superseded = new Set(all.map((e) => e.supersedes).filter(Boolean))
  const current = all.filter((e) => !superseded.has(e.id))
  assert.equal(current.length, 1)
  assert.equal(current[0].id, 'e2')
  await db.close()
})

test('identical terms hash identically, changed terms do not', async () => {
  const base = {
    procedure: 'Hernia repair',
    hospital: 'Sunrise Multispeciality',
    roomTier: 'General ward',
    lineItems: ITEMS,
  }
  assert.equal(hashEstimate(base), hashEstimate({ ...base, lineItems: [...ITEMS] }))

  /* A room upgrade is exactly the kind of change this exists to catch. */
  assert.notEqual(hashEstimate(base), hashEstimate({ ...base, roomTier: 'Private room' }))

  const nudged = ITEMS.map((i) =>
    i.label === 'Consumables' ? { ...i, amount: 9500 } : i,
  )
  assert.notEqual(hashEstimate(base), hashEstimate({ ...base, lineItems: nudged }))
})

test('a price written two ways hashes the same', async () => {
  const base = {
    procedure: 'Hernia repair',
    hospital: 'Sunrise Multispeciality',
    roomTier: 'General ward',
    lineItems: [{ label: 'Surgeon fee', amount: 35000 }],
  }
  const same = { ...base, lineItems: [{ label: ' Surgeon fee ', amount: 35000.0 }] }
  assert.equal(hashEstimate(base), hashEstimate(same), 'must not raise a false dispute')
})

test('a dispute records the desk figure without touching the estimate', async () => {
  const db = await freshDb()
  await addUser(db, 'u1', '+919000000001')
  await addLead(db, 'l1', 'u1')
  await issue(db, 'e1', 'l1')

  await db.query(
    `INSERT INTO clinic.estimate_disputes (id, estimate_id, raised_by, quoted_total, detail)
     VALUES ('d1','e1','u1',72000,'Reception is asking for a private room charge')`,
  )

  const dispute = await db.one(`SELECT * FROM clinic.estimate_disputes WHERE id = 'd1'`)
  assert.equal(Number(dispute.quoted_total), 72000)
  assert.equal(dispute.status, 'OPEN')

  const estimate = await db.one(`SELECT total FROM clinic.estimates WHERE id = 'e1'`)
  assert.equal(Number(estimate.total), 57500, 'raising a dispute must not alter the document')
  await db.close()
})

test('an enquiry carrying an estimate cannot be deleted', async () => {
  const db = await freshDb()
  await addLead(db, 'l1')
  await issue(db, 'e1', 'l1')

  /* The obvious way to erase an inconvenient price is not to edit the
     estimate but to delete its parent. A cascade here would let that work
     without any UPDATE or DELETE on clinic.estimates ever being attempted,
     so the foreign key restricts instead. */
  await assert.rejects(
    () => db.query(`DELETE FROM clinic.surgery_leads WHERE id = 'l1'`),
    /RESTRICT|violates foreign key|still referenced/i,
  )
  assert.equal((await db.query('SELECT 1 FROM clinic.estimates')).length, 1)
  await db.close()
})

test('an enquiry with no estimate is still disposable', async () => {
  const db = await freshDb()
  await addLead(db, 'l1')
  await db.query(`DELETE FROM clinic.surgery_leads WHERE id = 'l1'`)
  assert.equal((await db.query('SELECT 1 FROM clinic.surgery_leads')).length, 0)
  await db.close()
})
