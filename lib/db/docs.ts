import 'server-only'
import { getDb, ensureSchema } from './client'
import { randomBytes } from 'node:crypto'

/**
 * Document store, now backed by a single JSONB table rather than NeDB.
 *
 * These records have a shape that varies per row — a prescription holds a
 * variable-length drug list, each drug with its own dose, frequency, intake
 * and duration. Relationally that is a join table plus several nullable
 * columns; as a JSONB value it stays one object.
 *
 * Keeping them in Postgres alongside the relational tables removes the
 * dual-write consistency problem that a second database would create, and a
 * GIN index on `body` keeps containment queries fast.
 */

async function db() {
  await ensureSchema()
  return getDb()
}

function docId() {
  return `doc_${randomBytes(9).toString('hex')}`
}

type StoredDoc<T> = { id: string; body: T; created_at: string }

async function insert<T extends object>(collection: string, subjectId: string | null, body: T) {
  const d = await db()
  const id = docId()
  await d.query(
    'INSERT INTO documents (id, collection, subject_id, body) VALUES ($1, $2, $3, $4)',
    [id, collection, subjectId, JSON.stringify(body)],
  )
  return { id, ...body }
}

async function listBySubject<T>(collection: string, subjectId: string, limit = 50) {
  const d = await db()
  const rows = await d.query<StoredDoc<T>>(
    `SELECT id, body, created_at FROM documents
     WHERE collection = $1 AND subject_id = $2
     ORDER BY created_at DESC LIMIT $3`,
    [collection, subjectId, limit],
  )
  return rows.map((r) => ({ ...(r.body as object), _id: r.id, createdAt: r.created_at }) as T)
}

async function count(collection: string) {
  const d = await db()
  const row = await d.one<{ n: string }>(
    'SELECT COUNT(*) AS n FROM documents WHERE collection = $1',
    [collection],
  )
  return Number(row?.n ?? 0)
}

/* ───────────────────────────────────────────────────────────── types */

export type PrescribedDrug = {
  drug: string
  dose: string
  frequency: string
  intake: string
  days: string
}

export type PrescriptionDoc = {
  _id?: string
  patientId: string
  patientName: string
  doctorId: string
  doctorName: string
  drugs: PrescribedDrug[]
  advice?: string
  createdAt?: string
}

export type ChartNoteDoc = {
  _id?: string
  patientId: string
  doctorId: string
  complaints?: string
  observations?: string
  diagnosis?: string
  createdAt?: string
}

export type ReviewDoc = {
  _id?: string
  doctorId: string
  userId: string
  authorName: string
  rating: number
  comment: string
  createdAt?: string
}

export type ActivityDoc = {
  _id?: string
  kind: string
  message: string
  userId?: string
  meta?: Record<string, unknown>
  createdAt?: string
}

/* ────────────────────────────────────────────────────────── activity */

/** Append-only feed for the admin console. Never throws into a request. */
export async function logActivity(entry: Omit<ActivityDoc, '_id' | 'createdAt'>) {
  try {
    await insert('activity', entry.userId ?? null, entry)
  } catch {
    /* Telemetry must never break the user's action. */
  }
}

export async function recentActivity(limit = 50): Promise<ActivityDoc[]> {
  const d = await db()
  const rows = await d.query<StoredDoc<ActivityDoc>>(
    `SELECT id, body, created_at FROM documents
     WHERE collection = 'activity' ORDER BY created_at DESC LIMIT $1`,
    [limit],
  )
  return rows.map((r) => ({ ...r.body, _id: r.id, createdAt: r.created_at }))
}

/* ─────────────────────────────────────────────────────────── reviews */

export async function listReviews(doctorSlug: string, limit = 20): Promise<ReviewDoc[]> {
  return listBySubject<ReviewDoc>('reviews', doctorSlug, limit)
}

export async function hasReviewed(doctorSlug: string, userId: string): Promise<boolean> {
  const d = await db()
  const row = await d.one<{ n: string }>(
    `SELECT COUNT(*) AS n FROM documents
     WHERE collection = 'reviews' AND subject_id = $1 AND body->>'userId' = $2`,
    [doctorSlug, userId],
  )
  return Number(row?.n ?? 0) > 0
}

export async function addReview(review: Omit<ReviewDoc, '_id' | 'createdAt'>) {
  await insert('reviews', review.doctorId, review)
}

/** Recomputes the cached average so the card and JSON-LD stay in step. */
export async function ratingFor(doctorSlug: string): Promise<{ average: number; count: number }> {
  const d = await db()
  const row = await d.one<{ avg: string | null; n: string }>(
    `SELECT AVG((body->>'rating')::numeric) AS avg, COUNT(*) AS n
     FROM documents WHERE collection = 'reviews' AND subject_id = $1`,
    [doctorSlug],
  )
  const count = Number(row?.n ?? 0)
  if (count === 0) return { average: 0, count: 0 }
  return { average: Math.round(Number(row!.avg) * 10) / 10, count }
}

/* ──────────────────────────────────────────── prescriptions & notes */

export async function addPrescription(doc: Omit<PrescriptionDoc, '_id' | 'createdAt'>) {
  return insert('prescriptions', doc.patientId, doc)
}

export async function listPrescriptions(patientId: string): Promise<PrescriptionDoc[]> {
  return listBySubject<PrescriptionDoc>('prescriptions', patientId)
}

export async function addChartNote(doc: Omit<ChartNoteDoc, '_id' | 'createdAt'>) {
  return insert('chart_notes', doc.patientId, doc)
}

export async function listChartNotes(patientId: string): Promise<ChartNoteDoc[]> {
  return listBySubject<ChartNoteDoc>('chart_notes', patientId)
}

/* ───────────────────────────────────────────────────────── counters */

export const prescriptions = () => 'prescriptions'
export const chartNotes = () => 'chart_notes'
export const reviews = () => 'reviews'
export const activity = () => 'activity'

export async function countDocs(collection: () => string): Promise<number> {
  return count(collection())
}

/* ────────────────────────────────────────────────────────── triage */

export type TriageDoc = {
  _id: string
  leadId: string
  looksGenuine: boolean
  urgency: 'routine' | 'soon' | 'urgent'
  summary: string
  procedure: string
  concerns: string[]
  createdAt: string
}

/**
 * Advice about an enquiry, kept beside it rather than on it.
 *
 * Deliberately not a column on clinic.surgery_leads: this is a machine's
 * opinion, the lead row is the record of fact, and mixing them invites reading
 * one as the other. A lead with no triage document behaves exactly as it did
 * before the feature existed.
 */
export async function addTriage(doc: Omit<TriageDoc, '_id' | 'createdAt'>) {
  await insert('triage', doc.leadId, doc)
}

export async function triageFor(leadId: string): Promise<TriageDoc | undefined> {
  const rows = await listBySubject<TriageDoc>('triage', leadId, 1)
  return rows[0]
}

/** Triage for many leads at once, so a queue does not issue a query per row. */
export async function triageForMany(leadIds: string[]): Promise<Map<string, TriageDoc>> {
  const found = new Map<string, TriageDoc>()
  if (leadIds.length === 0) return found

  const d = await db()
  const rows = await d.query<{ subject_id: string; body: TriageDoc }>(
    `SELECT subject_id, body FROM documents
     WHERE collection = 'triage' AND subject_id = ANY($1)
     ORDER BY created_at DESC`,
    [leadIds],
  )

  for (const row of rows) {
    const body = typeof row.body === 'string' ? JSON.parse(row.body) : row.body
    if (!found.has(row.subject_id)) found.set(row.subject_id, body)
  }
  return found
}
