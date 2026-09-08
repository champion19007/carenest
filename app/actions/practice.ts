'use server'

import { revalidatePath } from 'next/cache'
import { currentClaims, requireRole } from '@/lib/auth'
import { assertAllowed, PolicyError } from '@/lib/policy'
import { answerRequest, findDoctorByUserId, writeAudit } from '@/lib/db/sql'
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

  const moved = await answerRequest({ bookingId, doctorId: doctor.id, to: decision })
  if (!moved) {
    /* Either it was already answered, or it belongs to another practice.
       Both deserve the same message: saying which would confirm the existence
       of another clinic's booking. */
    return { error: 'That request has already been answered.' }
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
