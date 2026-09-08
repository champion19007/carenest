import 'server-only'
import { getDb, ensureSchema } from './client'

/**
 * Relational data access.
 *
 * Every function is async because the driver is — Neon speaks HTTP, and PGlite
 * runs a WASM Postgres. Schema application is idempotent and awaited on first
 * use, so a cold serverless start against an empty database self-heals rather
 * than 500s.
 */

async function db() {
  await ensureSchema()
  return getDb()
}

export function nowIso() {
  return new Date().toISOString()
}

/* ─────────────────────────────────────────────────────────────── types */

export type User = {
  id: string
  phone: string
  name: string
  email: string | null
  dob: string | null
  gender: string | null
  city: string | null
  role: string
  tenant_region: string
  kyc_level: string
  created_at: string
  last_login_at: string | null
}

export type DoctorRow = {
  id: string
  user_id: string | null
  slug: string
  name: string
  speciality: string
  qualification: string
  experience: number
  clinic: string
  locality_id: number | null
  pin_code: string
  locality: string
  city: string
  fee: number
  registration_no: string | null
  council: string | null
  status: string
  rating: number
  reviews_count: number
  video: boolean
  cashless: boolean
  home_visit: boolean
  gender: string
  languages: string
  next_slot: string
  kind: string
  about: string
  created_at: string
}

export type Booking = {
  id: string
  user_id: string
  doctor_id: string
  slot_id: string | null
  kind: string
  slot: string
  fee: number
  status: string
  payment_ref: string | null
  created_at: string
}

export type Admin = {
  id: string
  username: string
  password_hash: string
  salt: string
  created_at: string
  last_login_at: string | null
}

export type Locality = {
  locality_id: number
  pin_code: string
  name: string
  city: string
}

export type AreaSuggestion = Locality & { doctor_count: number; ring: number }

/* ─────────────────────────────────────────────────────────────── users */

export async function findUserByPhone(phone: string): Promise<User | undefined> {
  const d = await db()
  return d.one<User>('SELECT * FROM patient.users WHERE phone = $1', [phone])
}

export async function findUserById(id: string): Promise<User | undefined> {
  const d = await db()
  return d.one<User>('SELECT * FROM patient.users WHERE id = $1', [id])
}

export async function createUser(input: {
  id: string
  phone: string
  name?: string
  role?: string
  tenantRegion?: string
}): Promise<User> {
  const d = await db()
  const row = await d.one<User>(
    `INSERT INTO patient.users (id, phone, name, role, tenant_region)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.id, input.phone, input.name ?? '', input.role ?? 'patient', input.tenantRegion ?? 'IN-MH'],
  )
  return row!
}

export async function setUserName(userId: string, name: string) {
  const d = await db()
  await d.query('UPDATE patient.users SET name = $1 WHERE id = $2', [name, userId])
}

export async function setUserRole(userId: string, role: string) {
  const d = await db()
  await d.query('UPDATE patient.users SET role = $1 WHERE id = $2', [role, userId])
}

export async function touchLogin(userId: string) {
  const d = await db()
  await d.query('UPDATE patient.users SET last_login_at = now() WHERE id = $1', [userId])
}

export async function listUsers(limit = 200): Promise<User[]> {
  const d = await db()
  return d.query<User>('SELECT * FROM patient.users ORDER BY created_at DESC LIMIT $1', [limit])
}

export async function countUsers(): Promise<number> {
  const d = await db()
  const row = await d.one<{ n: string }>('SELECT COUNT(*) AS n FROM patient.users')
  return Number(row?.n ?? 0)
}

/* ─────────────────────────────────────────────────────────── sessions */

export async function createSession(token: string, userId: string, days = 30) {
  const d = await db()
  await d.query(
    `INSERT INTO patient.sessions (token, user_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [token, userId, String(days)],
  )
}

export async function findSession(token: string) {
  const d = await db()
  return d.one<{ user_id: string; expires_at: string }>(
    'SELECT user_id, expires_at FROM patient.sessions WHERE token = $1',
    [token],
  )
}

export async function deleteSession(token: string) {
  const d = await db()
  await d.query('DELETE FROM patient.sessions WHERE token = $1', [token])
}

export async function countActiveSessions(): Promise<number> {
  const d = await db()
  const row = await d.one<{ n: string }>(
    'SELECT COUNT(*) AS n FROM patient.sessions WHERE expires_at > now()',
  )
  return Number(row?.n ?? 0)
}

/* ──────────────────────────────────────────────────────────────── otps */

export async function putOtp(phone: string, code: string, minutes = 10) {
  const d = await db()
  await d.query(
    `INSERT INTO otps (phone, code, expires_at, attempts)
     VALUES ($1, $2, now() + ($3 || ' minutes')::interval, 0)
     ON CONFLICT (phone) DO UPDATE
       SET code = excluded.code, expires_at = excluded.expires_at, attempts = 0`,
    [phone, code, String(minutes)],
  )
}

export async function takeOtp(phone: string) {
  const d = await db()
  return d.one<{ code: string; expires_at: string; attempts: number }>(
    'SELECT code, expires_at, attempts FROM otps WHERE phone = $1',
    [phone],
  )
}

export async function bumpOtpAttempts(phone: string) {
  const d = await db()
  await d.query('UPDATE otps SET attempts = attempts + 1 WHERE phone = $1', [phone])
}

export async function clearOtp(phone: string) {
  const d = await db()
  await d.query('DELETE FROM otps WHERE phone = $1', [phone])
}

/* ─────────────────────────────────────────────────────── rate limiting */

/**
 * Fixed-window counter. Done in a single statement so two concurrent requests
 * cannot both read a stale count and both decide they are under the limit.
 */
export async function hitRateLimit(
  bucket: string,
  key: string,
  limit: number,
  windowMinutes: number,
): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  const d = await db()

  const row = await d.one<{ count: number; window_start: string; expired: boolean }>(
    `INSERT INTO rate_limits (bucket, key, count, window_start)
     VALUES ($1, $2, 1, now())
     ON CONFLICT (bucket, key) DO UPDATE SET
       count = CASE
         WHEN rate_limits.window_start < now() - ($3 || ' minutes')::interval THEN 1
         ELSE rate_limits.count + 1
       END,
       window_start = CASE
         WHEN rate_limits.window_start < now() - ($3 || ' minutes')::interval THEN now()
         ELSE rate_limits.window_start
       END
     RETURNING count, window_start, false AS expired`,
    [bucket, key, String(windowMinutes)],
  )

  const count = Number(row?.count ?? 1)
  if (count <= limit) {
    return { allowed: true, remaining: limit - count, retryAfterSeconds: 0 }
  }

  const started = new Date(row!.window_start).getTime()
  const retry = Math.max(0, Math.ceil((started + windowMinutes * 60_000 - Date.now()) / 1000))
  return { allowed: false, remaining: 0, retryAfterSeconds: retry }
}

/* ────────────────────────────────────────────────────── doctor search */

/**
 * Postgres returns NUMERIC as a string — JS floats cannot safely represent
 * arbitrary-precision decimals, so the driver refuses to guess. Coerce the
 * columns the UI does arithmetic on, once, here.
 */
function normaliseDoctor(row: DoctorRow): DoctorRow {
  return {
    ...row,
    rating: Number(row.rating),
    reviews_count: Number(row.reviews_count),
    fee: Number(row.fee),
    experience: Number(row.experience),
  }
}



export type DoctorQuery = {
  kind?: 'human' | 'vet'
  text?: string
  specialities?: string[]
  languages?: string[]
  localityIds?: number[]
  pinCode?: string
  city?: string
  minFee?: number
  maxFee?: number
  minExperience?: number
  maxExperience?: number
  video?: boolean
  cashless?: boolean
  homeVisit?: boolean
  femaleOnly?: boolean
  sort?: 'relevance' | 'rating' | 'fee-low' | 'experience'
  limit?: number
}

export async function searchDoctors(query: DoctorQuery = {}): Promise<DoctorRow[]> {
  const d = await db()
  const where: string[] = [`status = 'ACTIVE'`]
  const params: unknown[] = []
  const p = (value: unknown) => {
    params.push(value)
    return `$${params.length}`
  }

  where.push(`kind = ${p(query.kind ?? 'human')}`)

  if (query.specialities?.length) where.push(`speciality = ANY(${p(query.specialities)})`)
  if (query.localityIds?.length) where.push(`locality_id = ANY(${p(query.localityIds)})`)
  if (query.pinCode) where.push(`pin_code = ${p(query.pinCode)}`)
  if (query.city) where.push(`city = ${p(query.city)}`)
  if (query.minFee !== undefined) where.push(`fee >= ${p(query.minFee)}`)
  if (query.maxFee !== undefined) where.push(`fee <= ${p(query.maxFee)}`)
  if (query.minExperience !== undefined) where.push(`experience >= ${p(query.minExperience)}`)
  if (query.maxExperience !== undefined) where.push(`experience <= ${p(query.maxExperience)}`)
  if (query.video) where.push('video = true')
  if (query.cashless) where.push('cashless = true')
  if (query.homeVisit) where.push('home_visit = true')
  if (query.femaleOnly) where.push(`gender = 'Female'`)

  /* Languages are a comma-separated list; match any requested one. */
  if (query.languages?.length) {
    where.push(`string_to_array(languages, ',') && ${p(query.languages)}`)
  }

  /* Full-text, replacing the Elasticsearch index. */
  if (query.text?.trim()) {
    where.push(
      `to_tsvector('english', name || ' ' || speciality || ' ' || locality || ' ' || about)
       @@ plainto_tsquery('english', ${p(query.text.trim())})`,
    )
  }

  const order =
    query.sort === 'fee-low'
      ? 'fee ASC'
      : query.sort === 'experience'
        ? 'experience DESC'
        : query.sort === 'rating'
          ? 'rating DESC, reviews_count DESC'
          : 'rating DESC, experience DESC'

  const rows = await d.query<DoctorRow>(
    `SELECT * FROM provider.doctors WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${p(query.limit ?? 100)}`,
    params,
  )
  return rows.map(normaliseDoctor)
}

export async function findDoctorBySlug(slug: string): Promise<DoctorRow | undefined> {
  const d = await db()
  const row = await d.one<DoctorRow>('SELECT * FROM provider.doctors WHERE slug = $1', [slug])
  return row ? normaliseDoctor(row) : undefined
}

export async function findDoctorById(id: string): Promise<DoctorRow | undefined> {
  const d = await db()
  const row = await d.one<DoctorRow>('SELECT * FROM provider.doctors WHERE id = $1', [id])
  return row ? normaliseDoctor(row) : undefined
}

export async function listDoctors(limit = 200): Promise<DoctorRow[]> {
  const d = await db()
  const rows = await d.query<DoctorRow>(
    'SELECT * FROM provider.doctors ORDER BY created_at DESC LIMIT $1', [limit])
  return rows.map(normaliseDoctor)
}

export async function countDoctors(): Promise<number> {
  const d = await db()
  const row = await d.one<{ n: string }>('SELECT COUNT(*) AS n FROM provider.doctors')
  return Number(row?.n ?? 0)
}

export async function distinctSpecialities(kind: 'human' | 'vet' = 'human'): Promise<string[]> {
  const d = await db()
  const rows = await d.query<{ speciality: string }>(
    `SELECT DISTINCT speciality FROM provider.doctors WHERE kind = $1 AND status = 'ACTIVE' ORDER BY speciality`,
    [kind],
  )
  return rows.map((r) => r.speciality)
}

export async function updateDoctorRating(slug: string, rating: number, count: number) {
  const d = await db()
  await d.query('UPDATE provider.doctors SET rating = $1, reviews_count = $2 WHERE slug = $3', [
    rating,
    count,
    slug,
  ])
}

/* ─────────────────────────────────────── provider status (append-only) */

/**
 * Status is never mutated without a history row — medical-board disputes need
 * the full transition trail.
 */
export async function transitionDoctorStatus(input: {
  id: string
  doctorId: string
  toStatus: string
  reason?: string
  actor?: string
}) {
  const d = await db()
  const current = await d.one<{ status: string }>('SELECT status FROM provider.doctors WHERE id = $1', [
    input.doctorId,
  ])

  await d.query(
    `INSERT INTO provider.status_history (id, doctor_id, from_status, to_status, reason, actor)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [input.id, input.doctorId, current?.status ?? null, input.toStatus, input.reason ?? null, input.actor ?? null],
  )
  await d.query('UPDATE provider.doctors SET status = $1, updated_at = now() WHERE id = $2', [
    input.toStatus,
    input.doctorId,
  ])
}

export async function doctorStatusHistory(doctorId: string) {
  const d = await db()
  return d.query<{
    id: string
    from_status: string | null
    to_status: string
    reason: string | null
    actor: string | null
    created_at: string
  }>(
    'SELECT * FROM provider.status_history WHERE doctor_id = $1 ORDER BY created_at DESC',
    [doctorId],
  )
}

/* ─────────────────────────────────────────────────────────── documents */

export async function addProviderDocument(input: {
  id: string
  doctorId: string
  docType: string
  blobUrl: string
}) {
  const d = await db()
  await d.query(
    `INSERT INTO provider.documents (id, doctor_id, doc_type, blob_url) VALUES ($1, $2, $3, $4)`,
    [input.id, input.doctorId, input.docType, input.blobUrl],
  )
}

export async function listProviderDocuments(doctorId: string) {
  const d = await db()
  return d.query<{
    id: string
    doc_type: string
    blob_url: string
    status: string
    created_at: string
  }>('SELECT * FROM provider.documents WHERE doctor_id = $1 ORDER BY created_at DESC', [doctorId])
}

export async function setDocumentStatus(id: string, status: string, notes?: string) {
  const d = await db()
  await d.query('UPDATE provider.documents SET status = $1, notes = $2 WHERE id = $3', [
    status,
    notes ?? null,
    id,
  ])
}

/* ──────────────────────────────────────────────────────────── admins */

export async function findAdmin(username: string): Promise<Admin | undefined> {
  const d = await db()
  return d.one<Admin>('SELECT * FROM admins WHERE username = $1', [username])
}

export async function findAdminById(id: string) {
  const d = await db()
  return d.one<{ id: string; username: string }>(
    'SELECT id, username FROM admins WHERE id = $1',
    [id],
  )
}

export async function countAdmins(): Promise<number> {
  const d = await db()
  const row = await d.one<{ n: string }>('SELECT COUNT(*) AS n FROM admins')
  return Number(row?.n ?? 0)
}

export async function createAdmin(input: {
  id: string
  username: string
  passwordHash: string
  salt: string
}) {
  const d = await db()
  await d.query(
    'INSERT INTO admins (id, username, password_hash, salt) VALUES ($1, $2, $3, $4)',
    [input.id, input.username, input.passwordHash, input.salt],
  )
}

export async function touchAdminLogin(id: string) {
  const d = await db()
  await d.query('UPDATE admins SET last_login_at = now() WHERE id = $1', [id])
}

export async function createAdminSession(token: string, adminId: string, hours = 8) {
  const d = await db()
  await d.query(
    `INSERT INTO admin_sessions (token, admin_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' hours')::interval)`,
    [token, adminId, String(hours)],
  )
}

export async function findAdminSession(token: string) {
  const d = await db()
  return d.one<{ admin_id: string; expires_at: string }>(
    'SELECT admin_id, expires_at FROM admin_sessions WHERE token = $1',
    [token],
  )
}

export async function deleteAdminSession(token: string) {
  const d = await db()
  await d.query('DELETE FROM admin_sessions WHERE token = $1', [token])
}

/* ────────────────────────────────────────────────────────── bookings */

export async function createBooking(input: {
  id: string
  userId: string
  doctorId: string
  slotId?: string | null
  kind: string
  slot: string
  fee: number
  status?: string
  paymentRef?: string | null
}) {
  const d = await db()
  await d.query(
    `INSERT INTO patient.bookings (id, user_id, doctor_id, slot_id, kind, slot, fee, status, payment_ref)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.id,
      input.userId,
      input.doctorId,
      input.slotId ?? null,
      input.kind,
      input.slot,
      input.fee,
      input.status ?? 'confirmed',
      input.paymentRef ?? null,
    ],
  )
}

export async function listBookings(limit = 200): Promise<Booking[]> {
  const d = await db()
  return d.query<Booking>('SELECT * FROM patient.bookings ORDER BY created_at DESC LIMIT $1', [limit])
}

export async function listBookingsForUser(userId: string): Promise<Booking[]> {
  const d = await db()
  return d.query<Booking>(
    'SELECT * FROM patient.bookings WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
  )
}

export async function countBookings(): Promise<number> {
  const d = await db()
  const row = await d.one<{ n: string }>('SELECT COUNT(*) AS n FROM patient.bookings')
  return Number(row?.n ?? 0)
}

export async function setBookingStatus(id: string, status: string) {
  const d = await db()
  await d.query('UPDATE patient.bookings SET status = $1 WHERE id = $2', [status, id])
}

/* ──────────────────────────────────────────────── areas (map-free) */

/**
 * Resolves free text to a canonical area: PIN code, exact name, then prefix.
 * Three indexed lookups; no geocoding call anywhere on this path.
 */
export async function resolveArea(input: string): Promise<Locality | undefined> {
  const term = input.trim()
  if (!term) return undefined
  const d = await db()

  if (/^\d{6}$/.test(term)) {
    const byPin = await d.one<Locality>('SELECT * FROM localities WHERE pin_code = $1', [term])
    if (byPin) return byPin
  }

  const exact = await d.one<Locality>('SELECT * FROM localities WHERE lower(name) = lower($1)', [
    term,
  ])
  if (exact) return exact

  return d.one<Locality>(
    'SELECT * FROM localities WHERE lower(name) LIKE lower($1) ORDER BY name LIMIT 1',
    [`${term}%`],
  )
}

export async function listLocalities(): Promise<AreaSuggestion[]> {
  const d = await db()
  return d.query<AreaSuggestion>(
    `SELECT l.*, 0 AS ring,
       (SELECT COUNT(*) FROM provider.doctors dd
        WHERE dd.locality_id = l.locality_id AND dd.status = 'ACTIVE')::int AS doctor_count
     FROM localities l ORDER BY l.city, l.name`,
  )
}

/**
 * Neighbours of an area, by ring, annotated with live doctor counts.
 *
 * Pure indexed join against the pre-materialised adjacency table — the
 * request path never touches lat/lng. Areas with no doctors are dropped so a
 * suggestion chip never leads to a second empty page.
 */
export async function neighbouringAreas(
  localityId: number,
  kind: 'human' | 'vet' = 'human',
  maxRing = 2,
): Promise<AreaSuggestion[]> {
  const d = await db()
  const rows = await d.query<AreaSuggestion>(
    `SELECT l.locality_id, l.pin_code, l.name, l.city, a.ring,
       (SELECT COUNT(*) FROM provider.doctors dd
        WHERE dd.locality_id = l.locality_id AND dd.status = 'ACTIVE' AND dd.kind = $2)::int
        AS doctor_count
     FROM locality_adjacency a
     JOIN localities l ON l.locality_id = a.neighbor_locality_id
     WHERE a.locality_id = $1 AND a.ring <= $3
     ORDER BY a.ring ASC, doctor_count DESC, l.name`,
    [localityId, kind, maxRing],
  )
  return rows.filter((r) => r.doctor_count > 0)
}

export async function countLocalities(): Promise<number> {
  const d = await db()
  const row = await d.one<{ n: string }>('SELECT COUNT(*) AS n FROM localities')
  return Number(row?.n ?? 0)
}

/* ───────────────────────────────────────────────────────── audit log */

export type AuditEntry = {
  actorId?: string | null
  actorRole?: string | null
  action: string
  resource?: string | null
  tenantRegion?: string | null
  detail?: unknown
}

/**
 * Appends to the audit log and *throws* if it cannot.
 *
 * The caller decides what a failure means: for a page view that is a shrug,
 * for a PHI read it may mean the read must not be served. Swallowing the error
 * here would take that decision away from every caller at once.
 */
export async function writeAudit(entry: AuditEntry) {
  const d = await db()
  await d.query(
    `INSERT INTO audit_log (actor_id, actor_role, action, resource, tenant_region, detail)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      entry.actorId ?? null,
      entry.actorRole ?? null,
      entry.action,
      entry.resource ?? null,
      entry.tenantRegion ?? null,
      JSON.stringify(entry.detail ?? {}),
    ],
  )
}

/** For non-PHI bookkeeping, where losing a row is preferable to a 500. */
export async function writeAuditQuiet(entry: AuditEntry) {
  try {
    await writeAudit(entry)
  } catch {
    /* Best effort by design. */
  }
}

export async function recentAudit(limit = 50) {
  const d = await db()
  return d.query<{
    id: number
    actor_id: string | null
    actor_role: string | null
    action: string
    resource: string | null
    detail: unknown
    created_at: string
  }>('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT $1', [limit])
}

export async function countAudit(): Promise<number> {
  const d = await db()
  const row = await d.one<{ n: string }>('SELECT COUNT(*) AS n FROM audit_log')
  return Number(row?.n ?? 0)
}
