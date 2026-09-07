import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  freshDb, addArea, addBorder, addDoctor, addUser,
  searchDoctors, neighbouringAreas, resolveArea, hitRateLimit,
} from './helpers.mjs'

let db

beforeEach(async () => {
  db = await freshDb()
})
afterEach(async () => {
  await db.close()
})

describe('doctor search', () => {
  test('only ACTIVE doctors are listed', async () => {
    await addDoctor(db, 'a')
    await addDoctor(db, 'b', { status: 'PENDING' })
    await addDoctor(db, 'c', { status: 'SUSPENDED' })
    const rows = await searchDoctors(db)
    assert.deepEqual(rows.map((r) => r.id), ['a'])
  })

  test('vets and human doctors are separate populations', async () => {
    await addDoctor(db, 'human', { kind: 'human' })
    await addDoctor(db, 'vet', { kind: 'vet' })
    assert.deepEqual((await searchDoctors(db, { kind: 'human' })).map((r) => r.id), ['human'])
    assert.deepEqual((await searchDoctors(db, { kind: 'vet' })).map((r) => r.id), ['vet'])
  })

  test('an unset filter matches everything', async () => {
    await addDoctor(db, 'a', { video: false })
    await addDoctor(db, 'b', { video: true })
    assert.equal((await searchDoctors(db)).length, 2)
    assert.equal((await searchDoctors(db, { video: true })).length, 1)
  })

  test('ORs within a group, ANDs across groups', async () => {
    await addDoctor(db, 'gp', { speciality: 'General Physician', fee: 400 })
    await addDoctor(db, 'card', { speciality: 'Cardiologist', fee: 1200 })
    await addDoctor(db, 'derm', { speciality: 'Dermatologist', fee: 400 })

    assert.equal(
      (await searchDoctors(db, { specialities: ['General Physician', 'Cardiologist'] })).length, 2)

    const both = await searchDoctors(db, {
      specialities: ['General Physician', 'Cardiologist'], maxFee: 500,
    })
    assert.deepEqual(both.map((r) => r.id), ['gp'])
  })

  test('language matching uses array overlap, not substring', async () => {
    await addDoctor(db, 'a', { languages: 'English,Hindi' })
    await addDoctor(db, 'b', { languages: 'Tamil' })
    assert.deepEqual((await searchDoctors(db, { languages: ['Hindi'] })).map((r) => r.id), ['a'])
    assert.deepEqual((await searchDoctors(db, { languages: ['Tamil'] })).map((r) => r.id), ['b'])
    assert.equal((await searchDoctors(db, { languages: ['Hindi', 'Tamil'] })).length, 2)
  })

  test('fee ascending sort', async () => {
    await addDoctor(db, 'high', { fee: 1200 })
    await addDoctor(db, 'low', { fee: 300 })
    assert.deepEqual((await searchDoctors(db, { sort: 'fee-low' })).map((r) => r.id), ['low', 'high'])
  })

  test('unsatisfiable filters return nothing', async () => {
    await addDoctor(db, 'a', { fee: 1200, video: false })
    assert.equal((await searchDoctors(db, { maxFee: 500, video: true })).length, 0)
  })

  test('full-text search finds by speciality', async () => {
    await addDoctor(db, 'a', { name: 'Dr Asha Rao', speciality: 'Cardiologist' })
    await addDoctor(db, 'b', { name: 'Dr Ben Roy', speciality: 'Dermatologist' })
    const rows = await db.query(
      `SELECT id FROM doctors
       WHERE to_tsvector('english', name || ' ' || speciality || ' ' || locality || ' ' || about)
             @@ plainto_tsquery('english', $1)`,
      ['cardiologist'],
    )
    assert.deepEqual(rows.map((r) => r.id), ['a'])
  })
})

describe('area resolution', () => {
  beforeEach(async () => {
    await addArea(db, '401107', 'Mira Road East')
    await addArea(db, '401101', 'Bhayandar West')
  })

  test('exact PIN code', async () => {
    assert.equal((await resolveArea(db, '401107')).name, 'Mira Road East')
  })

  test('name, case-insensitive', async () => {
    assert.equal((await resolveArea(db, 'mira road east')).pin_code, '401107')
    assert.equal((await resolveArea(db, 'MIRA ROAD EAST')).pin_code, '401107')
  })

  test('name prefix', async () => {
    assert.equal((await resolveArea(db, 'Mira Road')).pin_code, '401107')
  })

  test('unknown area resolves to nothing', async () => {
    assert.equal(await resolveArea(db, '999999'), undefined)
    assert.equal(await resolveArea(db, 'Atlantis'), undefined)
  })

  test('whitespace is ignored', async () => {
    assert.equal((await resolveArea(db, '  401107  ')).pin_code, '401107')
  })
})

describe('proximity fallback', () => {
  let mira, bhayandarE, bhayandarW, dahisar

  beforeEach(async () => {
    mira = await addArea(db, '401107', 'Mira Road East')
    bhayandarE = await addArea(db, '401105', 'Bhayandar East')
    bhayandarW = await addArea(db, '401101', 'Bhayandar West')
    dahisar = await addArea(db, '400068', 'Dahisar East')

    await addBorder(db, mira, bhayandarE)
    await addBorder(db, mira, dahisar)
    await addBorder(db, bhayandarW, bhayandarE)
    await addBorder(db, bhayandarW, mira)

    await addDoctor(db, 'd1', { locality_id: mira })
    await addDoctor(db, 'd2', { locality_id: mira })
  })

  test('a populated area returns doctors directly', async () => {
    assert.equal((await searchDoctors(db, { localityIds: [mira] })).length, 2)
  })

  test('an empty area returns nothing', async () => {
    assert.equal((await searchDoctors(db, { localityIds: [bhayandarW] })).length, 0)
  })

  test('suggests only neighbours that have doctors', async () => {
    const s = await neighbouringAreas(db, bhayandarW)
    assert.deepEqual(s.map((a) => a.pin_code), ['401107'])
    assert.equal(s[0].doctor_count, 2)
  })

  test('a suggestion is never another dead end', async () => {
    const s = await neighbouringAreas(db, bhayandarW)
    assert.ok(s.every((a) => a.doctor_count > 0))
  })

  test('busiest neighbour ranks first within a ring', async () => {
    await addDoctor(db, 'd3', { locality_id: bhayandarE })
    await addDoctor(db, 'd4', { locality_id: bhayandarE })
    await addDoctor(db, 'd5', { locality_id: bhayandarE })
    const s = await neighbouringAreas(db, bhayandarW)
    assert.deepEqual(s.map((a) => a.pin_code), ['401105', '401107'])
  })

  test('ring 1 is preferred over ring 2', async () => {
    const far = await addArea(db, '400066', 'Borivali East')
    await addBorder(db, bhayandarW, far, 2, 9.0)
    await addDoctor(db, 'd9', { locality_id: far })

    const s = await neighbouringAreas(db, bhayandarW, 'human', 2)
    assert.equal(s[0].pin_code, '401107', 'ring-1 neighbour must come first')
    assert.equal(s.at(-1).pin_code, '400066', 'ring-2 neighbour must come last')
  })

  test('ring 2 can be excluded', async () => {
    const far = await addArea(db, '400066', 'Borivali East')
    await addBorder(db, bhayandarW, far, 2, 9.0)
    await addDoctor(db, 'd9', { locality_id: far })

    const ring1Only = await neighbouringAreas(db, bhayandarW, 'human', 1)
    assert.ok(!ring1Only.some((a) => a.pin_code === '400066'))
  })

  test('adjacency is bidirectional', async () => {
    const rows = await db.query(
      'SELECT neighbor_locality_id FROM locality_adjacency WHERE locality_id = $1', [mira])
    assert.ok(rows.some((r) => r.neighbor_locality_id === bhayandarW))
  })

  test('vets are counted separately from doctors', async () => {
    await addDoctor(db, 'v1', { locality_id: bhayandarE, kind: 'vet' })
    assert.deepEqual((await neighbouringAreas(db, bhayandarW, 'vet')).map((a) => a.pin_code), ['401105'])
    assert.deepEqual((await neighbouringAreas(db, bhayandarW, 'human')).map((a) => a.pin_code), ['401107'])
  })

  test('pruning an edge removes the suggestion', async () => {
    await db.query(
      'DELETE FROM locality_adjacency WHERE locality_id = $1 AND neighbor_locality_id = $2',
      [bhayandarW, mira])
    assert.deepEqual(await neighbouringAreas(db, bhayandarW), [])
  })
})

describe('rate limiting', () => {
  test('allows up to the limit, then blocks', async () => {
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await hitRateLimit(db, 'otp', '999', 5, 60)).allowed, true, `attempt ${i + 1}`)
    }
    assert.equal((await hitRateLimit(db, 'otp', '999', 5, 60)).allowed, false)
  })

  test('counts each key independently', async () => {
    for (let i = 0; i < 5; i += 1) await hitRateLimit(db, 'otp', 'a', 5, 60)
    assert.equal((await hitRateLimit(db, 'otp', 'a', 5, 60)).allowed, false)
    assert.equal((await hitRateLimit(db, 'otp', 'b', 5, 60)).allowed, true)
  })

  test('resets after the window passes', async () => {
    await hitRateLimit(db, 'otp', 'x', 1, 60)
    assert.equal((await hitRateLimit(db, 'otp', 'x', 1, 60)).allowed, false)
    await db.query(
      `UPDATE rate_limits SET window_start = now() - interval '61 minutes' WHERE key = 'x'`)
    assert.equal((await hitRateLimit(db, 'otp', 'x', 1, 60)).allowed, true)
  })
})

describe('users', () => {
  test('phone numbers are unique', async () => {
    await addUser(db, 'u1', '9876543210')
    await assert.rejects(() => addUser(db, 'u2', '9876543210'), /duplicate key|unique/i)
  })

  test('new accounts default to the patient role', async () => {
    await db.query('INSERT INTO users (id, phone) VALUES ($1,$2)', ['u1', '9876543211'])
    const u = await db.one('SELECT role FROM users WHERE id = $1', ['u1'])
    assert.equal(u.role, 'patient')
  })
})
