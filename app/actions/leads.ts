'use server'

import {requireUser} from '@/lib/auth'
import {createEnquiry,routeEnquiry} from '@/lib/domain/enquiries'
import {consumeLimits} from '@/lib/domain/rate-limit'
import {DomainError} from '@/lib/domain/errors'
import { revalidatePath } from 'next/cache'
import { triageEnquiry } from '@/lib/triage'
import { emit } from '@/lib/db/outbox'
import { drainAll } from '@/lib/drain'
import {
  currentEstimate,
  findEstimate,
  issueEstimate,
  raiseDispute,
  type LineItem,
} from '@/lib/db/estimates'
import { currentAdmin, currentUser, newId } from '@/lib/auth'
import { hitRateLimit, writeAudit } from '@/lib/db/sql'
import { addReferral, createLead, getLead, transitionLead } from '@/lib/db/leads'
import { addTriage, logActivity } from '@/lib/db/docs'

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
export async function submitSurgeryLead(_prev:LeadState,form:FormData):Promise<LeadState>{
 const user=await requireUser('/surgeries')
 const limit=await consumeLimits([{bucket:'enquiry-account',key:user.id,limit:3,seconds:3600},{bucket:'enquiry-global',key:'all',limit:60,seconds:3600}])
 if(!limit.allowed)return {error:'Enquiry limit reached. Review your existing enquiries or try later.'}
 try{await createEnquiry(user.id,{city:form.get('city'),procedure:form.get('procedure'),notes:form.get('notes')??'',consent:form.get('consent')==='on',aiConsent:form.get('aiConsent')==='on'})}
 catch(error){if(error instanceof DomainError)return {error:error.message};throw error}
 revalidatePath('/account/enquiries');return {done:true,notice:'Enquiry recorded for coordinator review. Updates will appear in your account.'}
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

  try{await routeEnquiry(admin.id,id,doctorId,centreName)}catch(error){if(error instanceof DomainError)return {error:error.message};throw error}
  revalidatePath('/admin')
  revalidatePath('/practice/requests')
  return { notice: 'Sent on.' }
}

/* ── itemised estimates ─────────────────────────────────────────────── */

export type EstimateState = { error?: string; notice?: string }

/**
 * Price an approved enquiry, line by line.
 *
 * Only APPROVED or ROUTED enquiries can be priced: quoting a figure on
 * something nobody has looked at is how a spam submission ends up with a
 * number attached to it.
 *
 * Re-pricing does not edit. The previous estimate stays readable and the new
 * one records that it supersedes it, so "the price changed" is always
 * provable. The database refuses UPDATE on this table regardless, so a bug
 * here fails loudly rather than quietly rewriting a document a patient has
 * already seen.
 */
export async function issueEstimateAction(
  _prev: EstimateState,
  formData: FormData,
): Promise<EstimateState> {
  const admin = await requireAdmin()

  const leadId = String(formData.get('leadId') ?? '')
  const hospital = String(formData.get('hospital') ?? '').trim()
  const roomTier = String(formData.get('roomTier') ?? '').trim() || 'General ward'

  const lead = await getLead(leadId)
  if (!lead) return { error: 'That enquiry no longer exists.' }
  if (lead.status !== 'APPROVED' && lead.status !== 'ROUTED') {
    return { error: 'Only an approved enquiry can be priced.' }
  }
  if (!hospital) return { error: 'Name the hospital — the price depends on it.' }

  /* Parallel label/amount fields from the form, zipped back into line items. */
  const labels = formData.getAll('itemLabel').map(String)
  const amounts = formData.getAll('itemAmount').map(String)

  if(labels.length>30||amounts.length>30)return {error:'Use at most 30 estimate lines.'}
  const lineItems: LineItem[] = []
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]?.trim()
    const amount = Number(amounts[i])
    if (!label) continue
    if (!Number.isInteger(amount) || amount < 0 || amount > 10000000) {
      return { error: `"${label}" needs a whole rupee amount.` }
    }
    lineItems.push({ label, amount: Math.round(amount) })
  }

  if (lineItems.length === 0) {
    return { error: 'An estimate with no lines is exactly what this replaces.' }
  }

  const previous = await currentEstimate(leadId)

  const estimate = await issueEstimate({
    id: newId('est'),
    leadId,
    procedure: lead.procedure || 'Procedure',
    hospital,
    roomTier,
    lineItems,
    issuedBy: admin.id,
    supersedes: previous?.id ?? null,
  })

  revalidatePath('/admin')
  revalidatePath('/account')
  return {
    notice: previous
      ? `Re-priced at ₹${estimate.total.toLocaleString('en-IN')}. The earlier estimate stays on record.`
      : `Estimate issued: ₹${estimate.total.toLocaleString('en-IN')}.`,
  }
}

/**
 * The patient reporting that the desk is asking for a different number.
 *
 * Recorded against the estimate without altering it — the document under
 * dispute must not change when the dispute is raised, or there would be
 * nothing left to compare the desk's figure against.
 */
export async function disputeEstimateAction(
  _prev: EstimateState,
  formData: FormData,
): Promise<EstimateState> {
  const user = await currentUser()
  if (!user) return { error: 'Please sign in first.' }

  const estimateId = String(formData.get('estimateId') ?? '')
  const detail = String(formData.get('detail') ?? '').trim()
  const quotedRaw = String(formData.get('quotedTotal') ?? '').trim()

  const estimate = await findEstimate(estimateId)
  if (!estimate) return { error: 'That estimate no longer exists.' }

  /* The estimate must belong to this person's own enquiry. Without this,
     anyone could attach a dispute to any hospital's document. */
  const lead = await getLead(estimate.lead_id)
  if (!lead || lead.user_id !== user.id) {
    return { error: 'That estimate is not on your enquiry.' }
  }

  if (detail.length < 10) {
    return { error: 'Say what the clinic is charging differently, in a sentence.' }
  }

  const quotedTotal = quotedRaw ? Math.round(Number(quotedRaw)) : null
  if (quotedRaw && (!Number.isFinite(quotedTotal) || (quotedTotal ?? 0) < 0)) {
    return { error: 'Enter the amount they asked for as a number, or leave it blank.' }
  }

  await raiseDispute({
    id: newId('dsp'),
    estimateId,
    raisedBy: user.id,
    quotedTotal,
    detail,
  })

  await writeAudit({
    actorId: user.id,
    actorRole: 'patient',
    action: 'estimate:dispute',
    resource: estimateId,
    detail: { quotedTotal, agreedTotal: estimate.total },
  })

  revalidatePath('/account')
  return { notice: 'Flagged. We have a record of what you were quoted and what was agreed.' }
}
