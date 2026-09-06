import 'server-only'
import Datastore from '@seald-io/nedb'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Document store (NeDB — an embedded datastore with MongoDB's query API).
 *
 * This holds the records whose shape varies per row and would otherwise need
 * a pile of nullable columns or join tables:
 *
 *   - prescriptions  — a variable-length list of drugs, each with its own
 *                      dose / frequency / intake / duration
 *   - chart notes    — free text sections a doctor adds ad hoc
 *   - reviews        — patient comments with optional tags
 *   - activity       — an append-only audit feed for the admin console
 *
 * Structured, relational data (accounts, doctors, sessions, bookings) lives in
 * SQLite instead — see `lib/db/sql.ts`.
 *
 * The API is Mongo-compatible, so swapping this file for a real MongoDB
 * connection later is a contained change.
 */

const DATA_DIR = path.join(process.cwd(), '.data')
mkdirSync(DATA_DIR, { recursive: true })

type Store = InstanceType<typeof Datastore>

declare global {
  // eslint-disable-next-line no-var
  var __carenestDocs: Record<string, Store> | undefined
}

/**
 * Opened lazily on first use rather than at import time.
 *
 * `next build` runs several worker processes, and if each one auto-loaded
 * these files at import they would race on NeDB's compaction rename and throw
 * ENOENT. Deferring the open means only a process that actually reads or
 * writes touches the files.
 */
function open(name: string): Store {
  const cache = (globalThis.__carenestDocs ??= {})
  if (cache[name]) return cache[name]

  const store = new Datastore({
    filename: path.join(DATA_DIR, `${name}.db`),
    autoload: true,
    timestampData: true,
  })
  cache[name] = store
  return store
}

export const prescriptions = () => open('prescriptions')
export const chartNotes = () => open('chart-notes')
export const reviews = () => open('reviews')
export const activity = () => open('activity')

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
  createdAt?: Date
}

export type ChartNoteDoc = {
  _id?: string
  patientId: string
  doctorId: string
  complaints?: string
  observations?: string
  diagnosis?: string
  createdAt?: Date
}

export type ReviewDoc = {
  _id?: string
  doctorId: string
  userId: string
  authorName: string
  rating: number
  comment: string
  tags?: string[]
  createdAt?: Date
}

export type ActivityDoc = {
  _id?: string
  kind: string
  message: string
  userId?: string
  meta?: Record<string, unknown>
  createdAt?: Date
}

/** Append-only feed powering the admin console. Never throws into a request. */
export async function logActivity(entry: Omit<ActivityDoc, '_id' | 'createdAt'>) {
  try {
    await activity().insertAsync(entry)
  } catch {
    /* Telemetry must never break the user's action. */
  }
}

export async function recentActivity(limit = 50): Promise<ActivityDoc[]> {
  return activity().findAsync({}).sort({ createdAt: -1 }).limit(limit) as Promise<ActivityDoc[]>
}

export async function countDocs(store: () => Store): Promise<number> {
  return store().countAsync({})
}

/* ---------------------------------------------------------------- reviews */

export async function listReviews(doctorSlug: string, limit = 20): Promise<ReviewDoc[]> {
  return reviews()
    .findAsync({ doctorId: doctorSlug })
    .sort({ createdAt: -1 })
    .limit(limit) as Promise<ReviewDoc[]>
}

export async function hasReviewed(doctorSlug: string, userId: string) {
  return (await reviews().countAsync({ doctorId: doctorSlug, userId })) > 0
}

export async function addReview(review: Omit<ReviewDoc, '_id' | 'createdAt'>) {
  await reviews().insertAsync(review)
}

/** Recomputes the cached average so the card and JSON-LD stay in step. */
export async function ratingFor(doctorSlug: string): Promise<{ average: number; count: number }> {
  const all = (await reviews().findAsync({ doctorId: doctorSlug })) as ReviewDoc[]
  if (all.length === 0) return { average: 0, count: 0 }
  const total = all.reduce((sum, item) => sum + item.rating, 0)
  return { average: Math.round((total / all.length) * 10) / 10, count: all.length }
}

/* ---------------------------------------------------- prescriptions & notes */

export async function addPrescription(doc: Omit<PrescriptionDoc, '_id' | 'createdAt'>) {
  return prescriptions().insertAsync(doc) as Promise<PrescriptionDoc>
}

export async function listPrescriptions(patientId: string): Promise<PrescriptionDoc[]> {
  return prescriptions()
    .findAsync({ patientId })
    .sort({ createdAt: -1 }) as Promise<PrescriptionDoc[]>
}

export async function addChartNote(doc: Omit<ChartNoteDoc, '_id' | 'createdAt'>) {
  return chartNotes().insertAsync(doc) as Promise<ChartNoteDoc>
}

export async function listChartNotes(patientId: string): Promise<ChartNoteDoc[]> {
  return chartNotes().findAsync({ patientId }).sort({ createdAt: -1 }) as Promise<ChartNoteDoc[]>
}
