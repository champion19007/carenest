import 'server-only'
import { createHash } from 'node:crypto'
import { getDb, ensureSchema } from './client'

/**
 * Itemised surgery estimates.
 *
 * The problem is specific and common: a patient agrees to a figure, then the
 * bill arrives inflated by a room category nobody mentioned, consumables, and
 * administration. Naming every line before admission is what removes the
 * surprise.
 *
 * An estimate cannot be edited. A revision is a new row that supersedes the
 * old one, and the table refuses UPDATE and DELETE at the database level. That
 * is a deliberately weaker claim than "legally binding" — software cannot make
 * a document binding, and saying so would be a lie in the UI. What it can do
 * is make a quiet change impossible to hide, which is the part that actually
 * protects the patient.
 */

export type LineItem = {
  label: string
  amount: number
  /** Why this line exists, in the patient's language. */
  note?: string
}

export type Estimate = {
  id: string
  lead_id: string
  procedure: string
  hospital: string
  room_tier: string
  line_items: LineItem[]
  total: number
  content_hash: string
  supersedes: string | null
  issued_by: string | null
  valid_until: string | null
  created_at: string
}

export type Dispute = {
  id: string
  estimate_id: string
  raised_by: string | null
  quoted_total: number | null
  detail: string
  status: string
  created_at: string
}

async function db() {
  await ensureSchema()
  return getDb()
}

/**
 * A fingerprint of everything that determines the price.
 *
 * Deliberately excludes the id and timestamps: two estimates with identical
 * terms should hash identically, so a patient comparing the sheet on their
 * phone with the one on file is comparing the *terms*, not the paperwork.
 *
 * Amounts are normalised to integers first — 25000 and 25000.0 are the same
 * price, and a hash that disagreed would raise false disputes.
 */
export function hashEstimate(input: {
  procedure: string
  hospital: string
  roomTier: string
  lineItems: LineItem[]
}): string {
  const canonical = JSON.stringify({
    procedure: input.procedure.trim(),
    hospital: input.hospital.trim(),
    roomTier: input.roomTier.trim(),
    lineItems: input.lineItems.map((item) => [item.label.trim(), Math.round(item.amount)]),
  })
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32)
}

export function totalOf(lineItems: LineItem[]): number {
  return lineItems.reduce((sum, item) => sum + Math.round(item.amount), 0)
}

/**
 * Issue an estimate against a surgery enquiry.
 *
 * `supersedes` is how a price change is recorded. The old row stays exactly as
 * it was, which is the whole point — the patient can see both, and so can
 * anyone auditing later.
 */
export async function issueEstimate(input: {
  id: string
  leadId: string
  procedure: string
  hospital: string
  roomTier: string
  lineItems: LineItem[]
  issuedBy: string
  validDays?: number
  supersedes?: string | null
}): Promise<Estimate> {
  const d = await db()

  const total = totalOf(input.lineItems)
  const contentHash = hashEstimate({
    procedure: input.procedure,
    hospital: input.hospital,
    roomTier: input.roomTier,
    lineItems: input.lineItems,
  })

  const rows = await d.query<Estimate>(
    `INSERT INTO clinic.estimates
       (id, lead_id, procedure, hospital, room_tier, line_items, total,
        content_hash, supersedes, issued_by, valid_until)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,
             now() + ($11 || ' days')::interval)
     RETURNING *`,
    [
      input.id,
      input.leadId,
      input.procedure,
      input.hospital,
      input.roomTier,
      JSON.stringify(input.lineItems),
      total,
      contentHash,
      input.supersedes ?? null,
      input.issuedBy,
      String(input.validDays ?? 30),
    ],
  )

  return normalise(rows[0])
}

/** Every estimate for an enquiry, newest first — including superseded ones. */
export async function estimatesForLead(leadId: string): Promise<Estimate[]> {
  const d = await db()
  const rows = await d.query<Estimate>(
    'SELECT * FROM clinic.estimates WHERE lead_id = $1 ORDER BY created_at DESC',
    [leadId],
  )
  return rows.map(normalise)
}

/**
 * The estimate currently in force: the newest one nothing else supersedes.
 *
 * Computed rather than flagged, so there is no "is_current" column that could
 * disagree with the chain.
 */
export async function currentEstimate(leadId: string): Promise<Estimate | undefined> {
  const all = await estimatesForLead(leadId)
  const superseded = new Set(all.map((estimate) => estimate.supersedes).filter(Boolean))
  return all.find((estimate) => !superseded.has(estimate.id))
}

export async function findEstimate(id: string): Promise<Estimate | undefined> {
  const d = await db()
  const row = await d.one<Estimate>('SELECT * FROM clinic.estimates WHERE id = $1', [id])
  return row ? normalise(row) : undefined
}

/** The patient reporting that the desk is asking for a different number. */
export async function raiseDispute(input: {
  id: string
  estimateId: string
  raisedBy: string | null
  quotedTotal: number | null
  detail: string
}): Promise<void> {
  const d = await db()
  await d.query(
    `INSERT INTO clinic.estimate_disputes
       (id, estimate_id, raised_by, quoted_total, detail)
     VALUES ($1,$2,$3,$4,$5)`,
    [input.id, input.estimateId, input.raisedBy, input.quotedTotal, input.detail],
  )
}

export async function disputesForEstimate(estimateId: string): Promise<Dispute[]> {
  const d = await db()
  return d.query<Dispute>(
    'SELECT * FROM clinic.estimate_disputes WHERE estimate_id = $1 ORDER BY created_at DESC',
    [estimateId],
  )
}

export async function openDisputes(): Promise<(Dispute & { procedure: string })[]> {
  const d = await db()
  return d.query<Dispute & { procedure: string }>(
    `SELECT dsp.*, e.procedure
     FROM clinic.estimate_disputes dsp
     JOIN clinic.estimates e ON e.id = dsp.estimate_id
     WHERE dsp.status = 'OPEN'
     ORDER BY dsp.created_at DESC`,
  )
}

/**
 * Postgres returns INT as a number but NUMERIC-adjacent columns as strings,
 * and jsonb arrives parsed on one driver and as text on another. Normalising
 * once here keeps every caller from having to know which.
 */
function normalise(row: Estimate): Estimate {
  return {
    ...row,
    total: Number(row.total),
    line_items:
      typeof row.line_items === 'string'
        ? (JSON.parse(row.line_items) as LineItem[])
        : (row.line_items ?? []),
  }
}
