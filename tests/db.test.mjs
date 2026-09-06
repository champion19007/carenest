/**
 * Tests for the data layer, run on Node's built-in test runner:
 *
 *   npm test
 *
 * Each test opens its own in-memory database, so they are order-independent
 * and never touch the real `.data/` files.
 */
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'

/* The schema under test, kept in sync with lib/db/sql.ts. */
const SCHEMA = `
  CREATE TABLE users (
    id TEXT PRIMARY KEY, phone TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '',
    email TEXT, dob TEXT, gender TEXT, city TEXT,
    role TEXT NOT NULL DEFAULT 'patient', created_at TEXT NOT NULL, last_login_at TEXT);
  CREATE TABLE doctors (
    id TEXT PRIMARY KEY, user_id TEXT, name TEXT NOT NULL, speciality TEXT NOT NULL,
    qualification TEXT NOT NULL DEFAULT '', experience INTEGER NOT NULL DEFAULT 0,
    clinic TEXT NOT NULL DEFAULT '', locality TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '', fee INTEGER NOT NULL DEFAULT 0,
    reg_number TEXT, council TEXT, verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, rating REAL NOT NULL DEFAULT 0,
    reviews_count INTEGER NOT NULL DEFAULT 0, video INTEGER NOT NULL DEFAULT 0,
    cashless INTEGER NOT NULL DEFAULT 0, home_visit INTEGER NOT NULL DEFAULT 0,
    gender TEXT NOT NULL DEFAULT 'Female', languages TEXT NOT NULL DEFAULT '',
    next_slot TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'human',
    slug TEXT NOT NULL DEFAULT '', about TEXT NOT NULL DEFAULT '');
  CREATE TABLE rate_limits (
    bucket TEXT NOT NULL, key TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
    window_start TEXT NOT NULL, PRIMARY KEY (bucket, key));
  CREATE TABLE otps (
    phone TEXT PRIMARY KEY, code TEXT NOT NULL, expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0);
`

let db

function seedDoctor(overrides = {}) {
  const d = {
    id: 'doc-1', name: 'Dr. Test', speciality: 'General Physician', experience: 10,
    fee: 600, verified: 1, rating: 4.5, video: 1, cashless: 1, home_visit: 0,
    gender: 'Female', languages: 'English,Hindi', kind: 'human', slug: 'doc-1',
    ...overrides,
  }
  db.prepare(`INSERT INTO doctors
    (id,name,speciality,experience,fee,verified,rating,video,cashless,home_visit,gender,languages,kind,slug,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(d.id, d.name, d.speciality, d.experience, d.fee, d.verified, d.rating,
         d.video, d.cashless, d.home_visit, d.gender, d.languages, d.kind, d.slug,
         new Date().toISOString())
  return d
}

/* A direct port of searchDoctors() from lib/db/sql.ts. */
function searchDoctors(query = {}) {
  const where = ['verified = 1']
  const params = []
  where.push('kind = ?')
  params.push(query.kind ?? 'human')

  if (query.specialities?.length) {
    where.push(`speciality IN (${query.specialities.map(() => '?').join(',')})`)
    params.push(...query.specialities)
  }
  if (query.minFee !== undefined) { where.push('fee >= ?'); params.push(query.minFee) }
  if (query.maxFee !== undefined) { where.push('fee <= ?'); params.push(query.maxFee) }
  if (query.minExperience !== undefined) { where.push('experience >= ?'); params.push(query.minExperience) }
  if (query.video) where.push('video = 1')
  if (query.cashless) where.push('cashless = 1')
  if (query.femaleOnly) where.push("gender = 'Female'")
  if (query.languages?.length) {
    where.push(`(${query.languages.map(() => "(',' || languages || ',') LIKE ?").join(' OR ')})`)
    params.push(...query.languages.map((l) => `%,${l},%`))
  }
  const order = query.sort === 'fee-low' ? 'fee ASC'
    : query.sort === 'experience' ? 'experience DESC'
    : 'rating DESC, experience DESC'
  return db.prepare(`SELECT * FROM doctors WHERE ${where.join(' AND ')} ORDER BY ${order}`).all(...params)
}

function hitRateLimit(bucket, key, limit, windowMinutes) {
  const now = Date.now()
  const row = db.prepare('SELECT count, window_start FROM rate_limits WHERE bucket = ? AND key = ?')
    .get(bucket, key)
  const windowMs = windowMinutes * 60_000
  const started = row ? new Date(row.window_start).getTime() : 0
  if (!row || now - started >= windowMs) {
    db.prepare(`INSERT INTO rate_limits (bucket,key,count,window_start) VALUES (?,?,1,?)
      ON CONFLICT(bucket,key) DO UPDATE SET count=1, window_start=excluded.window_start`)
      .run(bucket, key, new Date(now).toISOString())
    return { allowed: true, remaining: limit - 1 }
  }
  if (row.count >= limit) return { allowed: false, remaining: 0 }
  db.prepare('UPDATE rate_limits SET count = count + 1 WHERE bucket = ? AND key = ?').run(bucket, key)
  return { allowed: true, remaining: limit - row.count - 1 }
}

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec(SCHEMA)
})

describe('doctor search', () => {
  test('excludes unverified doctors', () => {
    seedDoctor({ id: 'a', slug: 'a' })
    seedDoctor({ id: 'b', slug: 'b', verified: 0 })
    assert.deepEqual(searchDoctors().map((d) => d.id), ['a'])
  })

  test('separates human doctors from vets', () => {
    seedDoctor({ id: 'human', slug: 'human', kind: 'human' })
    seedDoctor({ id: 'vet', slug: 'vet', kind: 'vet' })
    assert.deepEqual(searchDoctors({ kind: 'human' }).map((d) => d.id), ['human'])
    assert.deepEqual(searchDoctors({ kind: 'vet' }).map((d) => d.id), ['vet'])
  })

  test('an unset filter matches everything', () => {
    seedDoctor({ id: 'a', slug: 'a', video: 0 })
    seedDoctor({ id: 'b', slug: 'b', video: 1 })
    assert.equal(searchDoctors({}).length, 2)
    assert.equal(searchDoctors({ video: true }).length, 1)
  })

  test('ORs within a group, ANDs across groups', () => {
    seedDoctor({ id: 'gp', slug: 'gp', speciality: 'General Physician', fee: 400 })
    seedDoctor({ id: 'card', slug: 'card', speciality: 'Cardiologist', fee: 1200 })
    seedDoctor({ id: 'derm', slug: 'derm', speciality: 'Dermatologist', fee: 400 })

    // Two specialities OR'd together
    assert.equal(searchDoctors({ specialities: ['General Physician', 'Cardiologist'] }).length, 2)
    // ...then AND'd with a fee ceiling
    const result = searchDoctors({
      specialities: ['General Physician', 'Cardiologist'],
      maxFee: 500,
    })
    assert.deepEqual(result.map((d) => d.id), ['gp'])
  })

  test('language match handles substrings correctly', () => {
    seedDoctor({ id: 'a', slug: 'a', languages: 'English,Hindi' })
    seedDoctor({ id: 'b', slug: 'b', languages: 'Tamil' })
    // "Hindi" must not accidentally match nothing, nor match "Tamil"
    assert.deepEqual(searchDoctors({ languages: ['Hindi'] }).map((d) => d.id), ['a'])
    assert.deepEqual(searchDoctors({ languages: ['Tamil'] }).map((d) => d.id), ['b'])
    assert.equal(searchDoctors({ languages: ['Hindi', 'Tamil'] }).length, 2)
  })

  test('fee ascending sort', () => {
    seedDoctor({ id: 'high', slug: 'high', fee: 1200 })
    seedDoctor({ id: 'low', slug: 'low', fee: 300 })
    assert.deepEqual(searchDoctors({ sort: 'fee-low' }).map((d) => d.id), ['low', 'high'])
  })

  test('returns nothing when filters cannot be satisfied', () => {
    seedDoctor({ id: 'a', slug: 'a', fee: 1200, video: 0 })
    assert.equal(searchDoctors({ maxFee: 500, video: true }).length, 0)
  })
})

describe('rate limiting', () => {
  test('allows up to the limit then blocks', () => {
    for (let i = 0; i < 5; i += 1) {
      assert.equal(hitRateLimit('otp', '999', 5, 60).allowed, true, `attempt ${i + 1}`)
    }
    assert.equal(hitRateLimit('otp', '999', 5, 60).allowed, false)
  })

  test('counts each key separately', () => {
    for (let i = 0; i < 5; i += 1) hitRateLimit('otp', 'a', 5, 60)
    assert.equal(hitRateLimit('otp', 'a', 5, 60).allowed, false)
    assert.equal(hitRateLimit('otp', 'b', 5, 60).allowed, true)
  })

  test('resets once the window has passed', () => {
    hitRateLimit('otp', 'x', 1, 60)
    assert.equal(hitRateLimit('otp', 'x', 1, 60).allowed, false)
    // Backdate the window to simulate time passing.
    db.prepare('UPDATE rate_limits SET window_start = ? WHERE key = ?')
      .run(new Date(Date.now() - 61 * 60_000).toISOString(), 'x')
    assert.equal(hitRateLimit('otp', 'x', 1, 60).allowed, true)
  })
})

describe('users', () => {
  test('phone numbers are unique', () => {
    const insert = () =>
      db.prepare('INSERT INTO users (id,phone,created_at) VALUES (?,?,?)')
        .run(Math.random().toString(), '9876543210', new Date().toISOString())
    insert()
    assert.throws(insert, /UNIQUE/)
  })

  test('new accounts default to the patient role', () => {
    db.prepare('INSERT INTO users (id,phone,created_at) VALUES (?,?,?)')
      .run('u1', '9876543211', new Date().toISOString())
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get('u1')
    assert.equal(user.role, 'patient')
  })
})
