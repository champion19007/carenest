/**
 * Test harness: a throwaway in-memory Postgres per test file.
 *
 * PGlite runs the same engine Neon does, so these tests exercise the real
 * dialect — `now()`, `RETURNING`, `jsonb`, `ON CONFLICT`, array operators —
 * rather than a SQLite approximation of it.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { splitStatements } from '../scripts/split-sql.mjs'

/** The schema the app actually applies, read from its single source. */
export function schemaStatements() {
  const src = readFileSync(path.join(process.cwd(), 'lib', 'db', 'schema.ts'), 'utf8')
  return splitStatements(src.slice(src.indexOf('`') + 1, src.lastIndexOf('`')))
}

export async function freshDb() {
  const pg = new PGlite()
  for (const stmt of schemaStatements()) await pg.query(stmt)

  return {
    async query(text, params = []) {
      return (await pg.query(text, params)).rows
    },
    async one(text, params = []) {
      return (await pg.query(text, params)).rows[0]
    },
    close: () => pg.close(),
  }
}

/* ── fixtures ──────────────────────────────────────────────────────── */

export async function addArea(db, pin, name, city = 'Mumbai') {
  const row = await db.one(
    'INSERT INTO localities (pin_code, name, city) VALUES ($1,$2,$3) RETURNING locality_id',
    [pin, name, city],
  )
  return row.locality_id
}

export async function addBorder(db, a, b, ring = 1, km = 2.0) {
  await db.query(
    `INSERT INTO locality_adjacency (locality_id, neighbor_locality_id, ring, distance_km)
     VALUES ($1,$2,$3,$4), ($2,$1,$3,$4)
     ON CONFLICT DO NOTHING`,
    [a, b, ring, km],
  )
}

export async function addDoctor(db, id, overrides = {}) {
  const d = {
    slug: id,
    name: `Dr ${id}`,
    speciality: 'General Physician',
    experience: 10,
    fee: 600,
    status: 'ACTIVE',
    kind: 'human',
    locality_id: null,
    gender: 'Female',
    languages: 'English,Hindi',
    video: false,
    cashless: false,
    home_visit: false,
    rating: 4.5,
    ...overrides,
  }
  await db.query(
    `INSERT INTO provider.doctors
      (id, slug, name, speciality, experience, fee, status, kind, locality_id,
       gender, languages, video, cashless, home_visit, rating)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [id, d.slug, d.name, d.speciality, d.experience, d.fee, d.status, d.kind,
     d.locality_id, d.gender, d.languages, d.video, d.cashless, d.home_visit, d.rating],
  )
  return d
}

export async function addUser(db, id, phone, role = 'patient') {
  await db.query('INSERT INTO patient.users (id, phone, role) VALUES ($1,$2,$3)', [id, phone, role])
}

/* ── ports of the production queries ───────────────────────────────── */

export async function searchDoctors(db, query = {}) {
  const where = [`status = 'ACTIVE'`]
  const params = []
  const p = (v) => { params.push(v); return `$${params.length}` }

  where.push(`kind = ${p(query.kind ?? 'human')}`)
  if (query.specialities?.length) where.push(`speciality = ANY(${p(query.specialities)})`)
  if (query.localityIds?.length) where.push(`locality_id = ANY(${p(query.localityIds)})`)
  if (query.minFee !== undefined) where.push(`fee >= ${p(query.minFee)}`)
  if (query.maxFee !== undefined) where.push(`fee <= ${p(query.maxFee)}`)
  if (query.minExperience !== undefined) where.push(`experience >= ${p(query.minExperience)}`)
  if (query.video) where.push('video = true')
  if (query.cashless) where.push('cashless = true')
  if (query.femaleOnly) where.push(`gender = 'Female'`)
  if (query.languages?.length) where.push(`string_to_array(languages, ',') && ${p(query.languages)}`)

  const order = query.sort === 'fee-low' ? 'fee ASC'
    : query.sort === 'experience' ? 'experience DESC'
    : 'rating DESC, experience DESC'

  return db.query(`SELECT * FROM provider.doctors WHERE ${where.join(' AND ')} ORDER BY ${order}`, params)
}

export async function neighbouringAreas(db, localityId, kind = 'human', maxRing = 2) {
  const rows = await db.query(
    `SELECT l.locality_id, l.pin_code, l.name, a.ring,
       (SELECT COUNT(*) FROM provider.doctors dd
        WHERE dd.locality_id = l.locality_id AND dd.status='ACTIVE' AND dd.kind=$2)::int
        AS doctor_count
     FROM locality_adjacency a
     JOIN localities l ON l.locality_id = a.neighbor_locality_id
     WHERE a.locality_id = $1 AND a.ring <= $3
     ORDER BY a.ring ASC, doctor_count DESC, l.name`,
    [localityId, kind, maxRing],
  )
  return rows.filter((r) => r.doctor_count > 0)
}

export async function resolveArea(db, input) {
  const term = (input ?? '').trim()
  if (!term) return undefined
  if (/^\d{6}$/.test(term)) {
    const byPin = await db.one('SELECT * FROM localities WHERE pin_code = $1', [term])
    if (byPin) return byPin
  }
  const exact = await db.one('SELECT * FROM localities WHERE lower(name) = lower($1)', [term])
  if (exact) return exact
  return db.one(
    'SELECT * FROM localities WHERE lower(name) LIKE lower($1) ORDER BY name LIMIT 1',
    [`${term}%`],
  )
}

export async function hitRateLimit(db, bucket, key, limit, windowMinutes) {
  const row = await db.one(
    `INSERT INTO rate_limits (bucket, key, count, window_start)
     VALUES ($1,$2,1,now())
     ON CONFLICT (bucket, key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start < now() - ($3 || ' minutes')::interval
                    THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start < now() - ($3 || ' minutes')::interval
                    THEN now() ELSE rate_limits.window_start END
     RETURNING count, window_start`,
    [bucket, key, String(windowMinutes)],
  )
  return { allowed: Number(row.count) <= limit, count: Number(row.count) }
}
