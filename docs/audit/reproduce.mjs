/**
 * Audit reproduction against the actual production modules, with an isolated
 * in-memory database. No application data or external services are accessed.
 * Run from the project root: node docs/audit/reproduce.mjs
 *
 * TypeScript is transpiled in memory. Framework/auth boundaries are test stubs;
 * database queries, schema, slot transitions and booking actions are real code.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const { PGlite } = require('@electric-sql/pglite')
const root = process.cwd()
const pg = new PGlite()
const db = {
  backend: 'pglite',
  async query(text, params = []) { return (await pg.query(text, params)).rows },
  async one(text, params = []) { return (await pg.query(text, params)).rows[0] },
  async exec(text) { await pg.exec(text) },
}
const cache = new Map()
let actor = { id: 'audit-a', name: 'Audit A', phone: '9000000091', role: 'patient' }
let ids = 0
class Redirect extends Error { constructor(target) { super(target); this.target = target } }
const mocks = {
  'server-only': {},
  'next/cache': { revalidatePath() {} },
  'next/server': { after() {} },
  'next/navigation': { redirect(target) { throw new Redirect(target) } },
  '@/lib/auth': {
    currentUser: async () => actor,
    requireUser: async () => actor,
    requireRole: async (role) => {
      if (actor.role !== role) throw new Error('wrong role')
      return actor
    },
    newId: (prefix) => `${prefix}_audit_${++ids}`,
  },
  '@/lib/drain': { drainAll: async () => {} },
}

function load(relative, globals = {}, fresh = false) {
  const filename = path.resolve(root, relative)
  if (!fresh && cache.has(filename)) return cache.get(filename)
  const module = { exports: {} }
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const localRequire = (name) => {
    if (name in mocks) return mocks[name]
    if (name === './client') return { getDb: () => db, ensureSchema: async () => {} }
    if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`)
    if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`)))
    return require(name)
  }
  const context = vm.createContext({
    module, exports: module.exports, require: localRequire,
    console, process, Buffer, Date, FormData, URL, ...globals,
  })
  new vm.Script(source, { filename }).runInContext(context)
  if (!fresh) cache.set(filename, module.exports)
  return module.exports
}

const { SCHEMA } = load('lib/db/schema.ts')
await pg.exec(SCHEMA)
const sql = load('lib/db/sql.ts')
const slots = load('lib/db/slots.ts')
const queue = load('lib/db/queue.ts')
const care = load('app/actions/care.ts')
const docs = load('lib/db/docs.ts')
const routes = load('lib/routes.ts')
const slotFormat = load('lib/slot-format.ts')
const results = []
async function demonstrate(id, description, run) {
  await run()
  results.push({ id, description, reproduced: true })
  console.log(`REPRODUCED ${id}: ${description}`)
}
async function addSlot(id, start = new Date(Date.now() + 86400000).toISOString()) {
  await db.query(
    `INSERT INTO provider.appointment_slots (slot_id, doctor_id, slot_start, slot_end)
     VALUES ($1, 'audit-doctor', $2, $2::timestamptz + interval '15 minutes')`, [id, start],
  )
}
async function booking(id, userId, slotId) {
  await sql.createBooking({ id, userId, doctorId: 'audit-doctor', slotId,
    kind: 'clinic', slot: 'audit', fee: 600, status: 'requested' })
}
const form = (values) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}
try {
  await sql.createUser({ id: 'audit-a', phone: '9000000091', name: 'Audit A' })
  await sql.createUser({ id: 'audit-b', phone: '9000000092', name: 'Audit B' })
  await db.query(`INSERT INTO provider.doctors (id, slug, name, speciality, experience, fee, status)
    VALUES ('audit-doctor', 'audit-doctor-slug', 'Audit Doctor', 'General Physician', 10, 600, 'ACTIVE')`)

  await demonstrate('B01', 'An expired request can confirm another patient\'s hold; both bookings become confirmed.', async () => {
    await addSlot('audit-expired')
    await slots.holdSlot({ slotId: 'audit-expired', userId: 'audit-a', minutes: -1 })
    await booking('audit-old', 'audit-a', 'audit-expired')
    await slots.holdSlot({ slotId: 'audit-expired', userId: 'audit-b' })
    await booking('audit-new', 'audit-b', 'audit-expired')
    assert.equal(await sql.answerRequest({ bookingId: 'audit-old', doctorId: 'audit-doctor', to: 'confirmed' }), true)
    assert.equal(await slots.confirmSlot('audit-expired'), true)
    assert.equal((await slots.findSlot('audit-expired')).locked_by, 'audit-b')
    assert.equal(await sql.answerRequest({ bookingId: 'audit-new', doctorId: 'audit-doctor', to: 'confirmed' }), true)
    assert.equal(await slots.confirmSlot('audit-expired'), false)
    const rows = await db.query(`SELECT id FROM patient.bookings WHERE slot_id = 'audit-expired' AND status = 'confirmed'`)
    assert.equal(rows.length, 2)
  })

  await demonstrate('B02', 'Declining an expired request releases a different patient\'s confirmed slot.', async () => {
    await addSlot('audit-decline')
    await slots.holdSlot({ slotId: 'audit-decline', userId: 'audit-a', minutes: -1 })
    await booking('audit-old-decline', 'audit-a', 'audit-decline')
    await slots.holdSlot({ slotId: 'audit-decline', userId: 'audit-b' })
    await booking('audit-new-decline', 'audit-b', 'audit-decline')
    await sql.answerRequest({ bookingId: 'audit-new-decline', doctorId: 'audit-doctor', to: 'confirmed' })
    await slots.confirmSlot('audit-decline')
    await sql.answerRequest({ bookingId: 'audit-old-decline', doctorId: 'audit-doctor', to: 'declined' })
    assert.equal(await slots.releaseSlot('audit-decline'), true)
    assert.equal((await sql.findBooking('audit-new-decline')).status, 'confirmed')
    assert.equal((await slots.findSlot('audit-decline')).status, 'AVAILABLE')
  })

  await demonstrate('B03', 'The real booking action accepts a family member belonging to another account.', async () => {
    await db.query(`INSERT INTO patient.family_members (id, user_id, name, relation, dob)
      VALUES ('audit-family-b', 'audit-b', 'Private family name', 'Father', '1960-01-01')`)
    await addSlot('audit-family-slot')
    await assert.rejects(() => care.bookAppointment({}, form({ slug: 'audit-doctor-slug', slotId: 'audit-family-slot', patientFor: 'audit-family-b' })), (error) => error instanceof Redirect)
    const rows = await sql.bookingsForDashboard('audit-a')
    assert.equal(rows.find((row) => row.seen_for === 'Private family name')?.seen_for, 'Private family name')
  })

  await demonstrate('B04', 'The real booking action accepts a past slot and video mode for a doctor without video enabled.', async () => {
    await addSlot('audit-past', new Date(Date.now() - 86400000).toISOString())
    await assert.rejects(() => care.bookAppointment({}, form({ slug: 'audit-doctor-slug', slotId: 'audit-past', kind: 'video' })), (error) => error instanceof Redirect)
    const row = await db.one(`SELECT * FROM patient.bookings WHERE slot_id = 'audit-past'`)
    assert.equal(row.kind, 'video')
    assert.equal(row.status, 'requested')
  })

  await demonstrate('B05', 'A rejected booking insert leaves the slot held without any booking.', async () => {
    await addSlot('audit-orphan')
    await assert.rejects(() => care.bookAppointment({}, form({ slug: 'audit-doctor-slug', slotId: 'audit-orphan', patientFor: 'does-not-exist' })), /foreign key/i)
    assert.equal((await slots.findSlot('audit-orphan')).status, 'HELD')
    const row = await db.one(`SELECT count(*)::int AS n FROM patient.bookings WHERE slot_id = 'audit-orphan'`)
    assert.equal(row.n, 0)
  })

  await demonstrate('B06', 'An unverified doctor can write a note and prescription for an unrelated patient.', async () => {
    actor = { id: 'unlinked-doctor', name: 'Unlinked Doctor', role: 'doctor', kyc_level: 'unverified' }
    await care.saveChartNote(form({ patientId: 'audit-b', diagnosis: 'Audit-only test note' }))
    await care.savePrescription(form({ patientId: 'audit-b', patientName: 'Forged name', drugs: JSON.stringify([{ drug: 'Audit only', dose: 'invalid', frequency: 'invalid', intake: 'invalid', days: '-5' }]) }))
    assert.equal((await docs.listChartNotes('audit-b'))[0].doctorId, 'unlinked-doctor')
    assert.equal((await docs.listPrescriptions('audit-b'))[0].patientName, 'Forged name')
    actor = { id: 'audit-a', name: 'Audit A', phone: '9000000091', role: 'patient' }
  })

  await demonstrate('B07', 'The queue function returns a status for a requested appointment tomorrow.', async () => {
    await addSlot('audit-tomorrow', new Date(Date.now() + 2 * 86400000).toISOString())
    await booking('audit-tomorrow-booking', 'audit-a', 'audit-tomorrow')
    assert.ok(await queue.queueStatusFor('audit-tomorrow-booking'))
  })

  await demonstrate('B08', 'A backslash destination passes the redirect guard and resolves to an external origin.', async () => {
    const target = routes.destinationFor('patient', '/\\audit.example')
    assert.equal(new URL(target, 'https://carenest.example').origin, 'https://audit.example')
  })

  await demonstrate('B09', 'Looking up a doctor ID as a slug fails when IDs and slugs differ.', async () => {
    assert.ok(await sql.findDoctorById('audit-doctor'))
    assert.equal(await sql.findDoctorBySlug('audit-doctor'), undefined)
  })

  await demonstrate('B10', 'After midnight IST, one-day slot generation uses the previous UTC date and generates no slots.', async () => {
    const instant = new Date('2026-10-05T20:00:00Z').getTime()
    class FixedDate extends Date {
      constructor(...args) { super(...(args.length ? args : [instant])) }
      static now() { return instant }
    }
    const fixedSlots = load('lib/db/slots.ts', { Date: FixedDate }, true)
    await db.query(`INSERT INTO provider.doctors (id, slug, name, speciality, experience)
      VALUES ('audit-midnight', 'audit-midnight', 'Midnight Test', 'General Physician', 10)`)
    await fixedSlots.ensureSlots('audit-midnight', 1)
    const row = await db.one(`SELECT count(*)::int AS n FROM provider.appointment_slots WHERE doctor_id = 'audit-midnight'`)
    assert.equal(row.n, 0)
  })

  await demonstrate('B11', 'A stored appointment label remains Today after the appointment date has passed.', async () => {
    const appointment = '2026-10-06T04:30:00Z'
    assert.match(slotFormat.slotLabel(appointment, new Date('2026-10-06T01:00:00Z')), /^Today, /)
  })

  await demonstrate('B12', 'The real booking action accepts a suspended doctor.', async () => {
    await db.query(`UPDATE provider.doctors SET status = 'SUSPENDED' WHERE id = 'audit-doctor'`)
    await addSlot('audit-suspended')
    await assert.rejects(() => care.bookAppointment({}, form({ slug: 'audit-doctor-slug', slotId: 'audit-suspended' })), (error) => error instanceof Redirect)
    assert.equal((await db.one(`SELECT status FROM patient.bookings WHERE slot_id = 'audit-suspended'`)).status, 'requested')
    await db.query(`UPDATE provider.doctors SET status = 'ACTIVE' WHERE id = 'audit-doctor'`)
  })

  await demonstrate('B13', 'Concurrent submissions through the real review action create duplicate reviews.', async () => {
    await db.query(`UPDATE patient.bookings SET status = 'attended', attended_at = now() WHERE id = 'audit-old'`)
    const data = () => form({ slug: 'audit-doctor-slug', rating: '5', comment: 'Audit-only concurrent review.' })
    const answers = await Promise.all([care.submitReview({}, data()), care.submitReview({}, data())])
    assert.equal(answers.filter((answer) => answer.ok).length, 2)
    const row = await db.one(`SELECT count(*)::int AS n FROM documents WHERE collection = 'reviews' AND subject_id = 'audit-doctor-slug' AND body->>'userId' = 'audit-a'`)
    assert.equal(row.n, 2)
  })

  console.log(JSON.stringify({ total: results.length, results }, null, 2))
} finally {
  await pg.close()
}
