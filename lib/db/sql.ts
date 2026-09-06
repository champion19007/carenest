import 'server-only'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Relational store (SQLite via Node's built-in driver — no native build step).
 *
 * SQL holds the things with a fixed shape and real relationships: accounts,
 * doctors, sessions, bookings. Anything free-form (chart notes, prescriptions,
 * reviews) lives in the document store instead — see `lib/db/docs.ts`.
 */

const DATA_DIR = path.join(process.cwd(), '.data')
mkdirSync(DATA_DIR, { recursive: true })

declare global {
  // eslint-disable-next-line no-var
  var __carenestSql: DatabaseSync | undefined
}

function connect() {
  const db = new DatabaseSync(path.join(DATA_DIR, 'carenest.sqlite'))
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      phone         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL DEFAULT '',
      email         TEXT,
      dob           TEXT,
      gender        TEXT,
      city          TEXT,
      role          TEXT NOT NULL DEFAULT 'patient',
      created_at    TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS doctors (
      id             TEXT PRIMARY KEY,
      user_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
      name           TEXT NOT NULL,
      speciality     TEXT NOT NULL,
      qualification  TEXT NOT NULL DEFAULT '',
      experience     INTEGER NOT NULL DEFAULT 0,
      clinic         TEXT NOT NULL DEFAULT '',
      locality       TEXT NOT NULL DEFAULT '',
      city           TEXT NOT NULL DEFAULT '',
      fee            INTEGER NOT NULL DEFAULT 0,
      reg_number     TEXT,
      council        TEXT,
      verified       INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS otps (
      phone      TEXT PRIMARY KEY,
      code       TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts   INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      doctor_id  TEXT NOT NULL,
      kind       TEXT NOT NULL,
      slot       TEXT NOT NULL,
      fee        INTEGER NOT NULL DEFAULT 0,
      status     TEXT NOT NULL DEFAULT 'confirmed',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admins (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt          TEXT NOT NULL,
      created_at    TEXT NOT NULL,
      last_login_at TEXT
    );

    /* Separate from the patient sessions table, which has a FK to users(id). */
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token      TEXT PRIMARY KEY,
      admin_id   TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    /* Areas the platform knows about, keyed by PIN code. */
    CREATE TABLE IF NOT EXISTS localities (
      pin_code TEXT PRIMARY KEY,
      name     TEXT NOT NULL,
      city     TEXT NOT NULL
    );

    /* Hardcoded adjacency: which areas border which. Distances are never
       computed at request time — the neighbours are authored, so they can be
       pruned by hand when an area has nothing useful in it. Stored one row
       per direction so lookups stay a single indexed read. */
    CREATE TABLE IF NOT EXISTS locality_neighbours (
      pin_code      TEXT NOT NULL REFERENCES localities(pin_code) ON DELETE CASCADE,
      neighbour_pin TEXT NOT NULL REFERENCES localities(pin_code) ON DELETE CASCADE,
      PRIMARY KEY (pin_code, neighbour_pin)
    );

    /* Sliding-window counters. One row per (bucket, key) pair. */
    CREATE TABLE IF NOT EXISTS rate_limits (
      bucket      TEXT NOT NULL,
      key         TEXT NOT NULL,
      count       INTEGER NOT NULL DEFAULT 0,
      window_start TEXT NOT NULL,
      PRIMARY KEY (bucket, key)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
    CREATE INDEX IF NOT EXISTS idx_doctors_speciality ON doctors(speciality);
    CREATE INDEX IF NOT EXISTS idx_doctors_city ON doctors(city);
    CREATE INDEX IF NOT EXISTS idx_doctors_pin ON doctors(pin_code);
    CREATE INDEX IF NOT EXISTS idx_localities_name ON localities(name);
  `)

  /* Columns added after the first release. SQLite has no ADD COLUMN IF NOT
     EXISTS, so check the table shape first. */
  const doctorCols = new Set(
    (db.prepare('PRAGMA table_info(doctors)').all() as { name: string }[]).map((c) => c.name),
  )
  const additions: [string, string][] = [
    ['rating', 'REAL NOT NULL DEFAULT 0'],
    ['reviews_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['video', 'INTEGER NOT NULL DEFAULT 0'],
    ['cashless', 'INTEGER NOT NULL DEFAULT 0'],
    ['home_visit', 'INTEGER NOT NULL DEFAULT 0'],
    ['gender', "TEXT NOT NULL DEFAULT 'Female'"],
    ['languages', "TEXT NOT NULL DEFAULT ''"],
    ['next_slot', "TEXT NOT NULL DEFAULT ''"],
    ['kind', "TEXT NOT NULL DEFAULT 'human'"],
    ['slug', "TEXT NOT NULL DEFAULT ''"],
    ['about', "TEXT NOT NULL DEFAULT ''"],
    ['pin_code', "TEXT NOT NULL DEFAULT ''"],
  ]
  for (const [name, decl] of additions) {
    if (!doctorCols.has(name)) db.exec(`ALTER TABLE doctors ADD COLUMN ${name} ${decl}`)
  }

  return db
}

/* Reuse one connection across hot reloads in development. */
export const sql = globalThis.__carenestSql ?? connect()
if (process.env.NODE_ENV !== 'production') globalThis.__carenestSql = sql

export type User = {
  id: string
  phone: string
  name: string
  email: string | null
  dob: string | null
  gender: string | null
  city: string | null
  role: string
  created_at: string
  last_login_at: string | null
}

export type Doctor = {
  id: string
  user_id: string | null
  name: string
  speciality: string
  qualification: string
  experience: number
  clinic: string
  locality: string
  city: string
  fee: number
  reg_number: string | null
  council: string | null
  verified: number
  created_at: string
}

export type Booking = {
  id: string
  user_id: string
  doctor_id: string
  kind: string
  slot: string
  fee: number
  status: string
  created_at: string
}

export function nowIso() {
  return new Date().toISOString()
}

/**
 * node:sqlite returns rows with a null prototype. React Server Components
 * refuse to serialise those to a client component ("Classes or null
 * prototypes are not supported"), so every row leaves this module as a plain
 * object.
 */
function plain<T>(row: unknown): T {
  return { ...(row as Record<string, unknown>) } as T
}

function plainAll<T>(rows: unknown[]): T[] {
  return rows.map((row) => plain<T>(row))
}

/* ------------------------------------------------------------------ users */

export function findUserByPhone(phone: string): User | undefined {
  const row = sql.prepare('SELECT * FROM users WHERE phone = ?').get(phone)
  return row ? plain<User>(row) : undefined
}

export function findUserById(id: string): User | undefined {
  const row = sql.prepare('SELECT * FROM users WHERE id = ?').get(id)
  return row ? plain<User>(row) : undefined
}

export function createUser(input: {
  id: string
  phone: string
  name?: string
  email?: string | null
  dob?: string | null
  gender?: string | null
  city?: string | null
  role?: string
}): User {
  sql
    .prepare(
      `INSERT INTO users (id, phone, name, email, dob, gender, city, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.phone,
      input.name ?? '',
      input.email ?? null,
      input.dob ?? null,
      input.gender ?? null,
      input.city ?? null,
      input.role ?? 'patient',
      nowIso(),
    )
  return findUserById(input.id)!
}

export function setUserName(userId: string, name: string) {
  sql.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, userId)
}

export function touchLogin(userId: string) {
  sql.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), userId)
}

export function listUsers(limit = 200): User[] {
  const rows = sql
    .prepare('SELECT * FROM users ORDER BY datetime(created_at) DESC LIMIT ?')
    .all(limit) as unknown[]
  return plainAll<User>(rows)
}

export function countUsers(): number {
  const row = sql.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }
  return row.n
}

/* ---------------------------------------------------------------- doctors */

export function listDoctors(limit = 200): Doctor[] {
  const rows = sql
    .prepare('SELECT * FROM doctors ORDER BY datetime(created_at) DESC LIMIT ?')
    .all(limit) as unknown[]
  return plainAll<Doctor>(rows)
}

export function countDoctors(): number {
  const row = sql.prepare('SELECT COUNT(*) AS n FROM doctors').get() as { n: number }
  return row.n
}

export function createDoctor(input: Omit<Doctor, 'created_at'>): Doctor {
  sql
    .prepare(
      `INSERT INTO doctors
       (id, user_id, name, speciality, qualification, experience, clinic, locality, city, fee, reg_number, council, verified, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.user_id,
      input.name,
      input.speciality,
      input.qualification,
      input.experience,
      input.clinic,
      input.locality,
      input.city,
      input.fee,
      input.reg_number,
      input.council,
      input.verified,
      nowIso(),
    )
  return sql.prepare('SELECT * FROM doctors WHERE id = ?').get(input.id) as Doctor
}

export function setDoctorVerified(id: string, verified: boolean) {
  sql.prepare('UPDATE doctors SET verified = ? WHERE id = ?').run(verified ? 1 : 0, id)
}

/* --------------------------------------------------------------- sessions */

export function createSession(token: string, userId: string, days = 30) {
  const expires = new Date(Date.now() + days * 86_400_000).toISOString()
  sql
    .prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, nowIso(), expires)
  return expires
}

export function findSession(token: string): { user_id: string; expires_at: string } | undefined {
  return sql.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').get(token) as
    | { user_id: string; expires_at: string }
    | undefined
}

export function deleteSession(token: string) {
  sql.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

export function countActiveSessions(): number {
  const row = sql
    .prepare("SELECT COUNT(*) AS n FROM sessions WHERE datetime(expires_at) > datetime('now')")
    .get() as { n: number }
  return row.n
}

/* ------------------------------------------------------------------- otps */

export function putOtp(phone: string, code: string, minutes = 10) {
  const expires = new Date(Date.now() + minutes * 60_000).toISOString()
  sql
    .prepare(
      `INSERT INTO otps (phone, code, expires_at, attempts) VALUES (?, ?, ?, 0)
       ON CONFLICT(phone) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, attempts = 0`,
    )
    .run(phone, code, expires)
}

export function takeOtp(phone: string): { code: string; expires_at: string; attempts: number } | undefined {
  return sql.prepare('SELECT code, expires_at, attempts FROM otps WHERE phone = ?').get(phone) as
    | { code: string; expires_at: string; attempts: number }
    | undefined
}

export function bumpOtpAttempts(phone: string) {
  sql.prepare('UPDATE otps SET attempts = attempts + 1 WHERE phone = ?').run(phone)
}

export function clearOtp(phone: string) {
  sql.prepare('DELETE FROM otps WHERE phone = ?').run(phone)
}

/* --------------------------------------------------------------- bookings */

export function createBooking(input: Omit<Booking, 'created_at' | 'status'> & { status?: string }) {
  sql
    .prepare(
      `INSERT INTO bookings (id, user_id, doctor_id, kind, slot, fee, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.user_id,
      input.doctor_id,
      input.kind,
      input.slot,
      input.fee,
      input.status ?? 'confirmed',
      nowIso(),
    )
}

export function listBookings(limit = 200): Booking[] {
  const rows = sql
    .prepare('SELECT * FROM bookings ORDER BY datetime(created_at) DESC LIMIT ?')
    .all(limit) as unknown[]
  return plainAll<Booking>(rows)
}

export function listBookingsForUser(userId: string): Booking[] {
  const rows = sql
    .prepare('SELECT * FROM bookings WHERE user_id = ? ORDER BY datetime(created_at) DESC')
    .all(userId) as unknown[]
  return plainAll<Booking>(rows)
}

export function countBookings(): number {
  const row = sql.prepare('SELECT COUNT(*) AS n FROM bookings').get() as { n: number }
  return row.n
}

/* ----------------------------------------------------------- doctor search */

export type DoctorRow = Doctor & {
  rating: number
  reviews_count: number
  video: number
  cashless: number
  home_visit: number
  gender: string
  /** Comma-separated; split on read. */
  languages: string
  next_slot: string
  kind: string
  slug: string
  about: string
  pin_code: string
}

export type DoctorQuery = {
  kind?: 'human' | 'vet'
  specialities?: string[]
  languages?: string[]
  city?: string
  /** Exact area match — the primary query in the area-search flow. */
  pinCode?: string
  minFee?: number
  maxFee?: number
  minExperience?: number
  maxExperience?: number
  video?: boolean
  cashless?: boolean
  homeVisit?: boolean
  femaleOnly?: boolean
  sort?: 'relevance' | 'rating' | 'fee-low' | 'experience'
}

/**
 * Filtered doctor search, executed in SQL rather than in JavaScript so it
 * still works once the table is larger than a page of results.
 */
export function searchDoctors(query: DoctorQuery = {}): DoctorRow[] {
  const where: string[] = ['verified = 1']
  const params: (string | number)[] = []

  where.push('kind = ?')
  params.push(query.kind ?? 'human')

  if (query.specialities?.length) {
    where.push(`speciality IN (${query.specialities.map(() => '?').join(',')})`)
    params.push(...query.specialities)
  }
  if (query.pinCode) {
    where.push('pin_code = ?')
    params.push(query.pinCode)
  }
  if (query.city) {
    where.push('city = ?')
    params.push(query.city)
  }
  if (query.minFee !== undefined) {
    where.push('fee >= ?')
    params.push(query.minFee)
  }
  if (query.maxFee !== undefined) {
    where.push('fee <= ?')
    params.push(query.maxFee)
  }
  if (query.minExperience !== undefined) {
    where.push('experience >= ?')
    params.push(query.minExperience)
  }
  if (query.maxExperience !== undefined) {
    where.push('experience <= ?')
    params.push(query.maxExperience)
  }
  if (query.video) where.push('video = 1')
  if (query.cashless) where.push('cashless = 1')
  if (query.homeVisit) where.push('home_visit = 1')
  if (query.femaleOnly) where.push("gender = 'Female'")

  /* Languages are stored comma-separated; match any of the requested ones. */
  if (query.languages?.length) {
    const clauses = query.languages.map(() => "(',' || languages || ',') LIKE ?")
    where.push(`(${clauses.join(' OR ')})`)
    params.push(...query.languages.map((language) => `%,${language},%`))
  }

  const order =
    query.sort === 'fee-low'
      ? 'fee ASC'
      : query.sort === 'experience'
        ? 'experience DESC'
        : query.sort === 'rating'
          ? 'rating DESC, reviews_count DESC'
          : 'rating DESC, experience DESC'

  const rows = sql
    .prepare(`SELECT * FROM doctors WHERE ${where.join(' AND ')} ORDER BY ${order}`)
    .all(...params) as unknown[]
  return plainAll<DoctorRow>(rows)
}

export function findDoctorBySlug(slug: string): DoctorRow | undefined {
  const row = sql.prepare('SELECT * FROM doctors WHERE slug = ?').get(slug)
  return row ? plain<DoctorRow>(row) : undefined
}

export function distinctSpecialities(kind: 'human' | 'vet' = 'human'): string[] {
  return (
    sql
      .prepare('SELECT DISTINCT speciality FROM doctors WHERE kind = ? AND verified = 1 ORDER BY speciality')
      .all(kind) as { speciality: string }[]
  ).map((row) => row.speciality)
}

export function updateDoctorRating(slug: string, rating: number, count: number) {
  sql
    .prepare('UPDATE doctors SET rating = ?, reviews_count = ? WHERE slug = ?')
    .run(rating, count, slug)
}

/* ------------------------------------------------------------------ admins */

export type Admin = {
  id: string
  username: string
  password_hash: string
  salt: string
  created_at: string
  last_login_at: string | null
}

export function findAdmin(username: string): Admin | undefined {
  const row = sql.prepare('SELECT * FROM admins WHERE username = ?').get(username)
  return row ? plain<Admin>(row) : undefined
}

export function countAdmins(): number {
  const row = sql.prepare('SELECT COUNT(*) AS n FROM admins').get() as { n: number }
  return row.n
}

export function createAdmin(input: {
  id: string
  username: string
  passwordHash: string
  salt: string
}) {
  sql
    .prepare(
      'INSERT INTO admins (id, username, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(input.id, input.username, input.passwordHash, input.salt, nowIso())
}

export function touchAdminLogin(id: string) {
  sql.prepare('UPDATE admins SET last_login_at = ? WHERE id = ?').run(nowIso(), id)
}

/* ------------------------------------------------------------ rate limits */

/**
 * Fixed-window counter. Returns whether the caller is under the limit and how
 * many attempts remain. Cheap and good enough to stop OTP abuse.
 */
export function hitRateLimit(
  bucket: string,
  key: string,
  limit: number,
  windowMinutes: number,
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now()
  const row = sql
    .prepare('SELECT count, window_start FROM rate_limits WHERE bucket = ? AND key = ?')
    .get(bucket, key) as { count: number; window_start: string } | undefined

  const windowMs = windowMinutes * 60_000
  const started = row ? new Date(row.window_start).getTime() : 0
  const expired = !row || now - started >= windowMs

  if (expired) {
    sql
      .prepare(
        `INSERT INTO rate_limits (bucket, key, count, window_start) VALUES (?, ?, 1, ?)
         ON CONFLICT(bucket, key) DO UPDATE SET count = 1, window_start = excluded.window_start`,
      )
      .run(bucket, key, new Date(now).toISOString())
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 }
  }

  if (row.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((started + windowMs - now) / 1000),
    }
  }

  sql
    .prepare('UPDATE rate_limits SET count = count + 1 WHERE bucket = ? AND key = ?')
    .run(bucket, key)
  return { allowed: true, remaining: limit - row.count - 1, retryAfterSeconds: 0 }
}

/* ------------------------------------------------------------------ roles */

export function setUserRole(userId: string, role: string) {
  sql.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId)
}

/* ------------------------------------------------------- admin sessions */

export function createAdminSession(token: string, adminId: string, hours = 8) {
  const expires = new Date(Date.now() + hours * 3_600_000).toISOString()
  sql
    .prepare(
      'INSERT INTO admin_sessions (token, admin_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    )
    .run(token, adminId, nowIso(), expires)
}

export function findAdminSession(
  token: string,
): { admin_id: string; expires_at: string } | undefined {
  const row = sql
    .prepare('SELECT admin_id, expires_at FROM admin_sessions WHERE token = ?')
    .get(token)
  return row ? plain<{ admin_id: string; expires_at: string }>(row) : undefined
}

export function deleteAdminSession(token: string) {
  sql.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token)
}

export function findAdminById(id: string): { id: string; username: string } | undefined {
  return sql.prepare('SELECT id, username FROM admins WHERE id = ?').get(id) as
    | { id: string; username: string }
    | undefined
}

/* --------------------------------------------------------------- areas */

export type Locality = { pin_code: string; name: string; city: string }
export type AreaSuggestion = Locality & { doctor_count: number }

/**
 * Resolves whatever the patient typed to a known area.
 *
 * Accepts a 6-digit PIN code or a locality name, matched case-insensitively.
 * This is a plain indexed string lookup — no geocoding call, no distance
 * maths, so it costs the same whether there are ten areas or ten thousand.
 */
export function resolveArea(input: string): Locality | undefined {
  const term = input.trim()
  if (!term) return undefined

  if (/^\d{6}$/.test(term)) {
    const row = sql.prepare('SELECT * FROM localities WHERE pin_code = ?').get(term)
    if (row) return plain<Locality>(row)
  }

  const exact = sql
    .prepare('SELECT * FROM localities WHERE lower(name) = lower(?)')
    .get(term)
  if (exact) return plain<Locality>(exact)

  /* Last resort: a prefix match, so "Mira Road" finds "Mira Road East". */
  const prefix = sql
    .prepare('SELECT * FROM localities WHERE lower(name) LIKE lower(?) ORDER BY name LIMIT 1')
    .get(`${term}%`)
  return prefix ? plain<Locality>(prefix) : undefined
}

export function listLocalities(): AreaSuggestion[] {
  const rows = sql
    .prepare(
      `SELECT l.*, (
         SELECT COUNT(*) FROM doctors d WHERE d.pin_code = l.pin_code AND d.verified = 1
       ) AS doctor_count
       FROM localities l ORDER BY l.city, l.name`,
    )
    .all() as unknown[]
  return plainAll<AreaSuggestion>(rows)
}

/**
 * The fallback path: pre-authored neighbours of an area, each annotated with
 * how many verified doctors it actually holds.
 *
 * Areas with no doctors are dropped, so a suggestion chip always leads to a
 * populated result rather than a second empty page. Ordering is by doctor
 * count so the most useful option comes first.
 */
export function neighbouringAreas(pinCode: string, kind: 'human' | 'vet' = 'human'): AreaSuggestion[] {
  const rows = sql
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
    .all(kind, pinCode) as unknown[]

  return plainAll<AreaSuggestion>(rows).filter((area) => area.doctor_count > 0)
}

export function upsertLocality(pinCode: string, name: string, city: string) {
  sql
    .prepare(
      `INSERT INTO localities (pin_code, name, city) VALUES (?, ?, ?)
       ON CONFLICT(pin_code) DO UPDATE SET name = excluded.name, city = excluded.city`,
    )
    .run(pinCode, name, city)
}

export function linkNeighbours(pinCode: string, neighbourPin: string) {
  sql
    .prepare(
      'INSERT OR IGNORE INTO locality_neighbours (pin_code, neighbour_pin) VALUES (?, ?)',
    )
    .run(pinCode, neighbourPin)
}

export function countLocalities(): number {
  const row = sql.prepare('SELECT COUNT(*) AS n FROM localities').get() as { n: number }
  return row.n
}
