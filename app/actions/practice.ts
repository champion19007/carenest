'use server'

import { revalidatePath } from 'next/cache'
import { currentClaims, requireRole } from '@/lib/auth'
import { assertAllowed, PolicyError } from '@/lib/policy'
import {
  answerRequest,
  findBooking,
  findDoctorByUserId,
  markBookingAttended,
  writeAudit,
} from '@/lib/db/sql'
import { closeSlot, confirmSlot, releaseSlot } from '@/lib/db/slots'
import { logActivity } from '@/lib/db/docs'

export type PracticeState = { error?: string; notice?: string }

/**
 * Accept or decline a request for an appointment.
 *
 * The policy module is consulted before anything is read or written. Until now
 * it existed and was tested but nothing called it, which made it a description
 * of the rules rather than an enforcement of them.
 */
export async function respondToRequest(
  _prev: PracticeState,
  formData: FormData,
): Promise<PracticeState> {
  const user = await requireRole('doctor', '/practice/requests')

  try {
    assertAllowed(await currentClaims(), 'practice:access')
  } catch (error) {
    if (error instanceof PolicyError) return { error: error.reason }
    throw error
  }

  const doctor = await findDoctorByUserId(user.id)
  if (!doctor) return { error: 'Your clinician profile is not set up yet.' }

  const bookingId = String(formData.get('bookingId') ?? '')
  const decision = String(formData.get('decision') ?? '')
  if (decision !== 'confirmed' && decision !== 'declined') {
    return { error: 'Choose accept or decline.' }
  }

  const booking = await findBooking(bookingId)
  const moved = await answerRequest({ bookingId, doctorId: doctor.id, to: decision })
  if (!moved) {
    /* Either it was already answered, or it belongs to another practice.
       Both deserve the same message: saying which would confirm the existence
       of another clinic's booking. */
    return { error: 'That request has already been answered.' }
  }

  /* Move the slot with the booking. Declining without releasing would leave
     the time held until its TTL expired, quietly removing it from the
     clinic's own calendar for two hours. */
  if (booking?.slot_id) {
    if (decision === 'confirmed') await confirmSlot(booking.slot_id)
    else await releaseSlot(booking.slot_id)
  }

  await writeAudit({
    actorId: user.id,
    actorRole: 'doctor',
    action: decision === 'confirmed' ? 'booking:accept' : 'booking:decline',
    resource: bookingId,
    tenantRegion: user.tenant_region,
  })

  await logActivity({
    kind: `booking.${decision}`,
    message: `${doctor.name} ${decision === 'confirmed' ? 'accepted' : 'declined'} a request`,
    userId: user.id,
    meta: { bookingId },
  })

  revalidatePath('/practice/requests')
  return { notice: decision === 'confirmed' ? 'Appointment confirmed.' : 'Request declined.' }
}

/**
 * Record that the patient was actually seen.
 *
 * This is the only way an appointment becomes reviewable, which makes it a
 * higher-value target than it looks: the clinician is being asked to assert a
 * fact about the past that later unlocks a rating of themselves. Hence the
 * same policy gate, ownership check and audit entry as accepting a request —
 * and a transition guarded in SQL rather than read-then-write, so a replayed
 * submission cannot mark the same appointment twice.
 */
export async function markAttended(
  _prev: PracticeState,
  formData: FormData,
): Promise<PracticeState> {
  const user = await requireRole('doctor', '/practice/requests')

  try {
    assertAllowed(await currentClaims(), 'practice:access')
  } catch (error) {
    if (error instanceof PolicyError) return { error: error.reason }
    throw error
  }

  const doctor = await findDoctorByUserId(user.id)
  if (!doctor) return { error: 'Your clinician profile is not set up yet.' }

  const bookingId = String(formData.get('bookingId') ?? '')
  if (!bookingId) return { error: 'Which appointment?' }

  const booking = await findBooking(bookingId)
  const moved = await markBookingAttended({ bookingId, doctorId: doctor.id })
  if (!moved) {
    /* Already marked, never confirmed, or another practice's booking. Saying
       which would confirm the existence of someone else's appointment. */
    return { error: 'That appointment cannot be marked as attended.' }
  }

  if (booking?.slot_id) await closeSlot(booking.slot_id, 'ATTENDED')

  await writeAudit({
    actorId: user.id,
    actorRole: 'doctor',
    action: 'booking:attended',
    resource: bookingId,
    tenantRegion: user.tenant_region,
  })

  await logActivity({
    kind: 'booking.attended',
    message: `${doctor.name} confirmed a patient was seen`,
    userId: user.id,
    meta: { bookingId },
  })

  revalidatePath('/practice/requests')
  return { notice: 'Marked as attended. The patient can now leave a review.' }
}
