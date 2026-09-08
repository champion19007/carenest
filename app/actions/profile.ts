'use server'

import { revalidatePath } from 'next/cache'
import { requireUser, newId } from '@/lib/auth'
import { updateUserProfile } from '@/lib/db/sql'
import {
  addFamilyMember,
  ensureSelfMember,
  getFamilyMember,
  removeFamilyMember,
  renameSelfMember,
  updateFamilyMember,
} from '@/lib/db/family'
import { updateUserPerson, writeAudit } from '@/lib/db/sql'

export type ProfileState = { error?: string; notice?: string }

const NAME = /^[\p{L}\p{M}.'\-\s]{2,80}$/u

/**
 * Validation is shared because a family member and the account holder are the
 * same kind of thing to a clinic: a person with a name and a date of birth.
 */
function readPerson(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim().replace(/\s+/g, ' ')
  const dob = String(formData.get('dob') ?? '').trim()
  const gender = String(formData.get('gender') ?? '').trim()

  if (!NAME.test(name)) {
    return { error: 'Enter a name between 2 and 80 letters.' as const }
  }
  /* A date of birth in the future is a typo every time, and one 130 years back
     is a mis-keyed year. Both are worth catching before a clinician sees it. */
  if (dob) {
    const when = new Date(dob)
    if (Number.isNaN(when.getTime())) return { error: 'That date of birth is not valid.' as const }
    if (when > new Date()) return { error: 'A date of birth cannot be in the future.' as const }
    if (when < new Date('1900-01-01')) return { error: 'Please check the year of birth.' as const }
  }
  return { name, dob: dob || null, gender: gender || null }
}

export async function saveProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await requireUser('/account/profile')
  const person = readPerson(formData)
  if ('error' in person) return { error: person.error }

  const email = String(formData.get('email') ?? '').trim()
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
    return { error: 'That email address does not look right.' }
  }

  await updateUserProfile(user.id, {
    name: person.name,
    email: email || null,
    dob: person.dob,
    gender: person.gender,
    city: String(formData.get('city') ?? '').trim() || null,
  })

  /* The household's "self" row is the same person, so it follows the rename
     rather than sitting there under the old name. */
  await ensureSelfMember(user.id, person.name, newId('fam'))
  await renameSelfMember(user.id, person.name)

  await writeAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'profile:update',
    resource: user.id,
    tenantRegion: user.tenant_region,
  })

  revalidatePath('/account/profile')
  revalidatePath('/dashboard/patient')
  return { notice: 'Your details are saved.' }
}

export async function addFamily(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await requireUser('/dashboard/patient')
  const person = readPerson(formData)
  if ('error' in person) return { error: person.error }

  const relation = String(formData.get('relation') ?? '').trim()
  if (!relation) return { error: 'Choose how this person is related to you.' }

  await addFamilyMember({
    id: newId('fam'),
    userId: user.id,
    name: person.name,
    relation,
    dob: person.dob,
    gender: person.gender,
    bloodGroup: String(formData.get('bloodGroup') ?? '').trim() || null,
    phone: String(formData.get('phone') ?? '').replace(/\D/g, '').slice(-10) || null,
  })

  revalidatePath('/dashboard/patient')
  return { notice: `${person.name} was added to your family.` }
}

export async function editFamily(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await requireUser('/dashboard/patient')
  const id = String(formData.get('id') ?? '')
  const person = readPerson(formData)
  if ('error' in person) return { error: person.error }

  /* Scoped to the signed-in account, so an id belonging to another household
     simply finds nothing. */
  const existing = await getFamilyMember(id, user.id)
  if (!existing) return { error: 'That family member no longer exists.' }

  await updateFamilyMember(id, user.id, {
    name: person.name,
    /* The account holder's own row keeps the relation "Self" — it is not
       something they should be able to set to "Brother". */
    relation: existing.is_self ? 'Self' : String(formData.get('relation') ?? existing.relation),
    dob: person.dob,
    gender: person.gender,
    bloodGroup: String(formData.get('bloodGroup') ?? '').trim() || null,
    phone: String(formData.get('phone') ?? '').replace(/\D/g, '').slice(-10) || null,
  })

  /* Editing the "self" row is editing the account holder, so the account
     record follows — but only these three fields, never the whole row. */
  if (existing.is_self) {
    await updateUserPerson(user.id, { name: person.name, dob: person.dob, gender: person.gender })
  }

  revalidatePath('/dashboard/patient')
  return { notice: 'Saved.' }
}

export async function deleteFamily(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await requireUser('/dashboard/patient')
  const id = String(formData.get('id') ?? '')

  const existing = await getFamilyMember(id, user.id)
  if (!existing) return { error: 'That family member no longer exists.' }
  if (existing.is_self) return { error: 'You cannot remove yourself from your own family.' }

  await removeFamilyMember(id, user.id)
  revalidatePath('/dashboard/patient')
  return { notice: `${existing.name} was removed.` }
}
