import 'server-only'
import { getDb, ensureSchema } from './client'

/**
 * The household attached to one account.
 *
 * Kept apart from `lib/db/sql.ts` because it belongs to the patient domain and
 * nothing outside that domain should be reaching for it.
 */

async function db() {
  await ensureSchema()
  return getDb()
}

export type FamilyMember = {
  id: string
  user_id: string
  name: string
  relation: string
  dob: string | null
  gender: string | null
  blood_group: string | null
  phone: string | null
  is_self: boolean
  created_at: string
}

/** Relations offered in the UI. 'Self' is not here — it is created, not chosen. */
export const RELATIONS = [
  'Spouse',
  'Son',
  'Daughter',
  'Father',
  'Mother',
  'Brother',
  'Sister',
  'Grandfather',
  'Grandmother',
  'Other',
] as const

export async function listFamily(userId: string): Promise<FamilyMember[]> {
  const d = await db()
  /* The account holder first, then oldest-added — a stable order, so a row
     never moves under a finger that is reaching for it. */
  return d.query<FamilyMember>(
    `SELECT * FROM patient.family_members
     WHERE user_id = $1
     ORDER BY is_self DESC, created_at ASC`,
    [userId],
  )
}

export async function getFamilyMember(id: string, userId: string) {
  const d = await db()
  /* user_id is part of the lookup, not checked afterwards: a member id from
     someone else's household simply returns nothing. */
  return d.one<FamilyMember>(
    'SELECT * FROM patient.family_members WHERE id = $1 AND user_id = $2',
    [id, userId],
  )
}

export async function addFamilyMember(input: {
  id: string
  userId: string
  name: string
  relation: string
  dob?: string | null
  gender?: string | null
  bloodGroup?: string | null
  phone?: string | null
  isSelf?: boolean
}) {
  const d = await db()
  await d.query(
    `INSERT INTO patient.family_members
       (id, user_id, name, relation, dob, gender, blood_group, phone, is_self)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      input.id,
      input.userId,
      input.name,
      input.relation,
      input.dob || null,
      input.gender || null,
      input.bloodGroup || null,
      input.phone || null,
      input.isSelf ?? false,
    ],
  )
}

export async function updateFamilyMember(
  id: string,
  userId: string,
  patch: {
    name: string
    relation: string
    dob?: string | null
    gender?: string | null
    bloodGroup?: string | null
    phone?: string | null
  },
) {
  const d = await db()
  await d.query(
    `UPDATE patient.family_members
     SET name = $3, relation = $4, dob = $5, gender = $6, blood_group = $7, phone = $8
     WHERE id = $1 AND user_id = $2`,
    [
      id,
      userId,
      patch.name,
      patch.relation,
      patch.dob || null,
      patch.gender || null,
      patch.bloodGroup || null,
      patch.phone || null,
    ],
  )
}

/**
 * Removes a member. The account holder's own row is not removable — deleting
 * it would orphan every booking made for themselves and leave the account
 * with no subject at all.
 */
export async function removeFamilyMember(id: string, userId: string) {
  const d = await db()
  await d.query(
    'DELETE FROM patient.family_members WHERE id = $1 AND user_id = $2 AND is_self = false',
    [id, userId],
  )
}

/**
 * Guarantees the account holder has their own row.
 *
 * Called on sign-in rather than only at sign-up, so accounts created before
 * family members existed pick one up on their next visit instead of needing a
 * migration.
 */
export async function ensureSelfMember(userId: string, name: string, id: string) {
  const d = await db()
  await d.query(
    `INSERT INTO patient.family_members (id, user_id, name, relation, is_self)
     VALUES ($1, $2, $3, 'Self', true)
     ON CONFLICT (user_id) WHERE is_self DO UPDATE
       SET name = EXCLUDED.name
       -- Only heals the placeholder. A row that already carries a real name is
       -- left alone, because the person may have edited it deliberately and
       -- this runs on nearly every page load.
       WHERE patient.family_members.name = 'You' AND EXCLUDED.name <> 'You'`,
    [id, userId, name || 'You'],
  )
}

/** Keeps the household's own row in step when the account is renamed. */
export async function renameSelfMember(userId: string, name: string) {
  const d = await db()
  await d.query(
    'UPDATE patient.family_members SET name = $2 WHERE user_id = $1 AND is_self',
    [userId, name],
  )
}
