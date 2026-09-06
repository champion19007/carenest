/**
 * Tests for area resolution and the proximity-graph fallback.
 *
 * These mirror the queries in lib/db/sql.ts so the behaviour is pinned even
 * though the app module itself is server-only and cannot be imported here.
 */
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'

const SCHEMA = `
  CREATE TABLE localities (
    pin_code TEXT PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL);
  CREATE TABLE locality_neighbours (
    pin_code TEXT NOT NULL REFERENCES localities(pin_code) ON DELETE CASCADE,
    neighbour_pin TEXT NOT NULL REFERENCES localities(pin_code) ON DELETE CASCADE,
    PRIMARY KEY (pin_code, neighbour_pin));
  CREATE TABLE doctors (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, speciality TEXT NOT NULL DEFAULT '',
    verified INTEGER NOT NULL DEFAULT 1, kind TEXT NOT NULL DEFAULT 'human',
    pin_code TEXT NOT NULL DEFAULT '', slug TEXT NOT NULL DEFAULT '');
`

let db

function area(pin, name, city = 'Mumbai') {
  db.prepare('INSERT INTO localities (pin_code,name,city) VALUES (?,?,?)').run(pin, name, city)
}

function border(a, b) {
  const link = db.prepare('INSERT OR IGNORE INTO locality_neighbours VALUES (?,?)')
  link.run(a, b)
  link.run(b, a)
}

function doctor(id, pin, kind = 'human', verified = 1) {
  db.prepare('INSERT INTO doctors (id,name,verified,kind,pin_code,slug) VALUES (?,?,?,?,?,?)')
    .run(id, id, verified, kind, pin, id)
}

/* Ports of resolveArea() and neighbouringAreas(). */
function resolveArea(input) {
  const term = (input ?? '').trim()
  if (!term) return undefined
  if (/^\d{6}$/.test(term)) {
    const row = db.prepare('SELECT * FROM localities WHERE pin_code = ?').get(term)
    if (row) return row
  }
  const exact = db.prepare('SELECT * FROM localities WHERE lower(name) = lower(?)').get(term)
  if (exact) return exact
  return db
    .prepare('SELECT * FROM localities WHERE lower(name) LIKE lower(?) ORDER BY name LIMIT 1')
    .get(`${term}%`)
}

function neighbouringAreas(pin, kind = 'human') {
  return db
    .prepare(
      `SELECT l.*, (
         SELECT COUNT(*) FROM doctors d
         WHERE d.pin_code = l.pin_code AND d.verified = 1 AND d.kind = ?
       ) AS doctor_count
       FROM locality_neighbours n
       JOIN localities l ON l.pin_code = n.neighbour_pin
       WHERE n.pin_code = ?
       ORDER BY doctor_count DESC, l.name`,
    )
    .all(kind, pin)
    .filter((a) => a.doctor_count > 0)
}

function doctorsIn(pin) {
  return db.prepare('SELECT * FROM doctors WHERE pin_code = ? AND verified = 1').all(pin)
}

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec(SCHEMA)

  // The worked example from the architecture note.
  area('401107', 'Mira Road East')
  area('401105', 'Bhayandar East')
  area('401101', 'Bhayandar West')
  area('400068', 'Dahisar East')

  border('401107', '401105')
  border('401107', '400068')
  border('401101', '401105')
  border('401101', '401107')

  doctor('d1', '401107')
  doctor('d2', '401107')
})

describe('area resolution', () => {
  test('matches an exact PIN code', () => {
    assert.equal(resolveArea('401107').name, 'Mira Road East')
  })

  test('matches a locality name regardless of case', () => {
    assert.equal(resolveArea('mira road east').pin_code, '401107')
    assert.equal(resolveArea('MIRA ROAD EAST').pin_code, '401107')
  })

  test('matches a name prefix', () => {
    // "Mira Road" should still find "Mira Road East"
    assert.equal(resolveArea('Mira Road').pin_code, '401107')
  })

  test('returns nothing for an unknown area', () => {
    assert.equal(resolveArea('999999'), undefined)
    assert.equal(resolveArea('Atlantis'), undefined)
  })

  test('ignores surrounding whitespace', () => {
    assert.equal(resolveArea('  401107  ').pin_code, '401107')
  })
})

describe('primary query', () => {
  test('returns doctors when the area has them', () => {
    assert.equal(doctorsIn('401107').length, 2)
  })

  test('returns nothing for a known but empty area', () => {
    assert.equal(doctorsIn('401101').length, 0)
  })

  test('excludes unverified doctors from the count', () => {
    doctor('d3', '401105', 'human', 0)
    assert.equal(doctorsIn('401105').length, 0)
  })
})

describe('proximity fallback', () => {
  test('suggests neighbours that actually have doctors', () => {
    // Bhayandar West is empty; its neighbours are Bhayandar East (0) and
    // Mira Road East (2). Only the populated one should be offered.
    const suggestions = neighbouringAreas('401101')
    assert.deepEqual(suggestions.map((a) => a.pin_code), ['401107'])
    assert.equal(suggestions[0].doctor_count, 2)
  })

  test('never suggests an area that would be another dead end', () => {
    const suggestions = neighbouringAreas('401101')
    assert.ok(suggestions.every((a) => a.doctor_count > 0))
  })

  test('ranks the busiest neighbour first', () => {
    doctor('d3', '401105')
    doctor('d4', '401105')
    doctor('d5', '401105')
    const suggestions = neighbouringAreas('401101')
    assert.deepEqual(suggestions.map((a) => a.pin_code), ['401105', '401107'])
  })

  test('adjacency is bidirectional', () => {
    // Mira Road East lists Bhayandar West as a neighbour too, even though the
    // edge was authored in the other direction.
    const rows = db
      .prepare('SELECT neighbour_pin FROM locality_neighbours WHERE pin_code = ?')
      .all('401107')
      .map((r) => r.neighbour_pin)
    assert.ok(rows.includes('401101'))
  })

  test('returns an empty list when every neighbour is empty', () => {
    // Dahisar East borders only Mira Road East here; drop its doctors.
    db.prepare('DELETE FROM doctors').run()
    assert.deepEqual(neighbouringAreas('400068'), [])
  })

  test('counts vets separately from doctors', () => {
    doctor('v1', '401105', 'vet')
    assert.deepEqual(neighbouringAreas('401101', 'vet').map((a) => a.pin_code), ['401105'])
    // The human search should not see the vet.
    assert.deepEqual(neighbouringAreas('401101', 'human').map((a) => a.pin_code), ['401107'])
  })

  test('pruning an edge removes the suggestion', () => {
    db.prepare('DELETE FROM locality_neighbours WHERE pin_code = ? AND neighbour_pin = ?')
      .run('401101', '401107')
    assert.deepEqual(neighbouringAreas('401101'), [])
  })
})
