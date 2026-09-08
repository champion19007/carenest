'use server'

import { revalidatePath } from 'next/cache'
import { currentAdmin, currentUser, newId } from '@/lib/auth'
import { hitRateLimit, writeAudit } from '@/lib/db/sql'
import { addReferral, createLead, getLead, transitionLead } from '@/lib/db/leads'
import { logActivity } from '@/lib/db/docs'

export type LeadState = { error?: string; notice?: string; done?: boolean }

const PHONE = /^[6-9]\d{9}$/

/**
 * A patient asking for a surgery callback.
 *
 * Open to signed-out visitors on purpose: someone comparing hospitals for a
 * parent's operation should not have to make an account first. That makes it
 * the one write path a stranger can reach, so it is rate limited by phone
 * number and lands as NEW for a person to read.
 */
export async function submitSurgeryLead(
  _prev: LeadState,
  formData: FormData,
): Promise<LeadState> {
  const name = String(formData.get('name') ?? '').trim().replace(/\s+/g, ' ')
  const phone = String(formData.get('phone') ?? '').replace(/\D/g, '').slice(-10)
  const city = String(formData.get('city') ?? '').trim()
  const procedure = String(formData.get('procedure') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()

  if (name.length < 2) return { error: 'Please enter your name.' }
  if (!PHONE.test(phone)) return { error: 'Enter a valid 10-digit Indian mobile number.' }
  if (notes.length > 1000) return { error: 'Please keep the description under 1000 characters.' }

  const limit = await hitRateLimit('lead:phone', phone, 3, 60)
  if (!limit.allowed) {
    return { error: 'We already have your request. A coordinator will call you shortly.' }
  }

  const user = await currentUser()
  const id = newId('lead')
  await createLead({ id, userId: user?.id ?? null, name, phone, city, procedure, notes })

  await logActivity({
    kind: 'lead.created',
    message: `Surgery enquiry from ${name}${procedure ? ` · ${procedure}` : ''}`,
    userId: user?.id,
    meta: { leadId: id },
  })

  return { done: true, notice: 'A care coordinator will call you within 15 minutes.' }
}

/* ─────────────────────────────────────────────────── admin decisions */

async function requireAdmin() {
  const admin = await currentAdmin()
  if (!admin) throw new Error('Admin session required')
  return admin
}

export async function approveLead(_prev: LeadState, formData: FormData): Promise<LeadState> {
  const admin = await requireAdmin()
  const id = String(formData.get('id') ?? '')

  const moved = await transitionLead({ id, from: 'NEW', to: 'APPROVED', adminId: admin.id })
  if (!moved) return { error: 'That enquiry has already been reviewed.' }

  await writeAudit({
    actorId: admin.id,
    actorRole: 'admin',
    action: 'lead:approve',
    resource: id,
  })
  revalidatePath('/admin')
  return { notice: 'Approved. You can now route it.' }
}

export async function rejectLead(_prev: LeadState, formData: FormData): Promise<LeadState> {
  const admin = await requireAdmin()
  const id = String(formData.get('id') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()

  const moved = await transitionLead({
    id,
    from: 'NEW',
    to: 'REJECTED',
    adminId: admin.id,
    reason: reason || 'No reason given',
  })
  if (!moved) return { error: 'That enquiry has already been reviewed.' }

  await writeAudit({
    actorId: admin.id,
    actorRole: 'admin',
    action: 'lead:reject',
    resource: id,
    detail: { reason },
  })
  revalidatePath('/admin')
  return { notice: 'Enquiry rejected.' }
}

/**
 * Sends an approved enquiry onward.
 *
 * A clinician, a diagnostic centre, or both — the form carries whichever were
 * chosen. Only an APPROVED lead can be routed, which is the whole point of the
 * approval step sitting between submission and a surgeon's inbox.
 */
export async function routeLead(_prev: LeadState, formData: FormData): Promise<LeadState> {
  const admin = await requireAdmin()
  const id = String(formData.get('id') ?? '')
  const doctorId = String(formData.get('doctorId') ?? '').trim()
  const centreName = String(formData.get('centreName') ?? '').trim()

  if (!doctorId && !centreName) {
    return { error: 'Choose a surgeon, a diagnostic centre, or both.' }
  }

  const lead = await getLead(id)
  if (!lead) return { error: 'That enquiry no longer exists.' }
  if (lead.status !== 'APPROVED') {
    return { error: 'Only an approved enquiry can be routed.' }
  }

  if (doctorId) {
    await addReferral({ id: newId('ref'), leadId: id, kind: 'doctor', doctorId })
  }
  if (centreName) {
    await addReferral({ id: newId('ref'), leadId: id, kind: 'diagnostic', centreName })
  }

  await transitionLead({ id, from: 'APPROVED', to: 'ROUTED', adminId: admin.id })

  await writeAudit({
    actorId: admin.id,
    actorRole: 'admin',
    action: 'lead:route',
    resource: id,
    detail: { doctorId: doctorId || null, centreName: centreName || null },
  })

  revalidatePath('/admin')
  revalidatePath('/practice/requests')
  return { notice: 'Sent on.' }
}
