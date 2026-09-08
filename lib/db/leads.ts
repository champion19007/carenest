import 'server-only'
import { getDb, ensureSchema } from './client'

/**
 * Surgery enquiries and where they were sent.
 *
 * The flow is deliberately not automatic:
 *
 *   patient submits  →  NEW
 *   admin approves   →  APPROVED  →  routed to a surgeon and/or a centre → ROUTED
 *   admin rejects    →  REJECTED
 *
 * A surgical enquiry is free text plus a phone number. Routing it straight
 * through would hand a clinician unverified clinical claims and hand a
 * diagnostic centre a stranger's number, so a person reads it first.
 */

async function db() {
  await ensureSchema()
  return getDb()
}

export type LeadStatus = 'NEW' | 'APPROVED' | 'REJECTED' | 'ROUTED'

export type SurgeryLead = {
  id: string
  user_id: string | null
  name: string
  phone: string
  city: string
  procedure: string
  notes: string
  status: LeadStatus
  reviewed_by: string | null
  reviewed_at: string | null
  reject_reason: string | null
  created_at: string
}

export type Referral = {
  id: string
  lead_id: string
  kind: 'doctor' | 'diagnostic'
  doctor_id: string | null
  centre_name: string | null
  status: string
  created_at: string
}

export async function createLead(input: {
  id: string
  userId?: string | null
  name: string
  phone: string
  city?: string
  procedure?: string
  notes?: string
}) {
  const d = await db()
  await d.query(
    `INSERT INTO clinic.surgery_leads (id, user_id, name, phone, city, procedure, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      input.id,
      input.userId ?? null,
      input.name,
      input.phone,
      input.city ?? '',
      input.procedure ?? '',
      input.notes ?? '',
    ],
  )
}

export async function listLeads(status?: LeadStatus): Promise<SurgeryLead[]> {
  const d = await db()
  if (status) {
    return d.query<SurgeryLead>(
      'SELECT * FROM clinic.surgery_leads WHERE status = $1 ORDER BY created_at DESC',
      [status],
    )
  }
  return d.query<SurgeryLead>('SELECT * FROM clinic.surgery_leads ORDER BY created_at DESC')
}

export async function getLead(id: string) {
  const d = await db()
  return d.one<SurgeryLead>('SELECT * FROM clinic.surgery_leads WHERE id = $1', [id])
}

/**
 * Moves a lead between states.
 *
 * The current status is part of the WHERE clause, so two admins clicking
 * "approve" on the same lead cannot both succeed — the second update matches
 * no row. Returns whether it actually moved.
 */
export async function transitionLead(input: {
  id: string
  from: LeadStatus
  to: LeadStatus
  adminId: string
  reason?: string | null
}): Promise<boolean> {
  const d = await db()
  const rows = await d.query<{ id: string }>(
    `UPDATE clinic.surgery_leads
     SET status = $3, reviewed_by = $4, reviewed_at = now(), reject_reason = $5
     WHERE id = $1 AND status = $2
     RETURNING id`,
    [input.id, input.from, input.to, input.adminId, input.reason ?? null],
  )
  return rows.length > 0
}

export async function addReferral(input: {
  id: string
  leadId: string
  kind: 'doctor' | 'diagnostic'
  doctorId?: string | null
  centreName?: string | null
}) {
  const d = await db()
  await d.query(
    `INSERT INTO clinic.referrals (id, lead_id, kind, doctor_id, centre_name)
     VALUES ($1,$2,$3,$4,$5)`,
    [input.id, input.leadId, input.kind, input.doctorId ?? null, input.centreName ?? null],
  )
}

export async function listReferrals(leadId: string): Promise<Referral[]> {
  const d = await db()
  return d.query<Referral>(
    'SELECT * FROM clinic.referrals WHERE lead_id = $1 ORDER BY created_at',
    [leadId],
  )
}

/** Referrals waiting for one clinician, newest first. */
export async function referralsForDoctor(doctorId: string) {
  const d = await db()
  return d.query<Referral & { lead_name: string; lead_phone: string; procedure: string; city: string; notes: string }>(
    `SELECT r.*, l.name AS lead_name, l.phone AS lead_phone,
            l.procedure, l.city, l.notes
     FROM clinic.referrals r
     JOIN clinic.surgery_leads l ON l.id = r.lead_id
     WHERE r.doctor_id = $1
     ORDER BY r.created_at DESC`,
    [doctorId],
  )
}
