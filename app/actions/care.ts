'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  createBooking,
  findDoctorBySlug,
  hasAttendedBooking,
  hitRateLimit,
  listBookingsForUser,
  updateDoctorRating,
} from '@/lib/db/sql'
import {
  addChartNote,
  addPrescription,
  addReview,
  hasReviewed,
  logActivity,
  ratingFor,
  type PrescribedDrug,
} from '@/lib/db/docs'
import { findSlot, holdSlot } from '@/lib/db/slots'
import { emit } from '@/lib/db/outbox'
import { drainAll } from '@/lib/drain'
import { slotLabel } from '@/lib/slot-format'
import { currentUser, newId, requireRole, requireUser } from '@/lib/auth'

export type BookingState = { error?: string }
export type ReviewState = { error?: string; ok?: boolean }

/**
 * Confirms an appointment. This is the point where an account becomes
 * necessary — a slot is a real, limited resource and has to belong to someone.
 */
export async function bookAppointment(
  _prev: BookingState,
  formData: FormData,
): Promise<BookingState> {
  const slug = String(formData.get('slug') ?? '')
  const slotId = String(formData.get('slotId') ?? '')
  const kind = String(formData.get('kind') ?? 'clinic')

  const doctor = await findDoctorBySlug(slug)
  if (!doctor) return { error: 'That doctor is no longer listed.' }
  if (!slotId) return { error: 'Choose a time slot first.' }

  const user = await requireUser(`/book/${slug}`)

  const limit = await hitRateLimit('booking:user', user.id, 10, 60)
  if (!limit.allowed) {
    return { error: 'You have made a lot of bookings recently. Please try again later.' }
  }

  const chosen = await findSlot(slotId)
  if (!chosen || chosen.doctor_id !== doctor.id) {
    return { error: 'That time is no longer on this clinic’s calendar.' }
  }

  /* The claim. Nothing above this decided whether the slot was free — that
     would be a read followed by a write, and two requests could both pass the
     read. holdSlot succeeds for exactly one of them and returns false to the
     other, so the loser is told rather than quietly double-booked. */
  const held = await holdSlot({ slotId, userId: user.id })
  if (!held) {
    return {
      error: 'Someone else just took that time. Pick another — the list has been refreshed.',
    }
  }

  const slot = slotLabel(chosen.slot_start)

  /* Who the appointment is for. An empty value means the account holder, so
     bookings made before family members existed still make sense. */
  const patientFor = String(formData.get('patientFor') ?? '') || null

  const id = newId('bkg')
  await createBooking({
    id,
    userId: user.id,
    doctorId: doctor.id,
    slotId,
    kind,
    slot,
    fee: doctor.fee,
    /* Not 'confirmed': a clinic that cannot decline a booking has no control
       over its own calendar. The clinician answers it from their queue. */
    status: 'requested',
    patientFor,
  })

  /* Recorded, not sent. The patient is still waiting on this response, and a
     gateway call here would put a third party on the critical path of their
     booking. */
  await emit({
    kind: 'booking.requested',
    subjectId: id,
    payload: { phone: user.phone, doctorName: doctor.name, slot },
  })

  /* Deliver once the patient has their response. Not a queue — if this
     invocation is killed the row stays PENDING and the cron picks it up. */
  after(async () => {
    await drainAll(5)
  })

  await logActivity({
    kind: 'booking.created',
    message: `${user.name || 'A patient'} requested ${doctor.name} · ${slot}`,
    userId: user.id,
    meta: { doctor: doctor.slug, slot, kind },
  })

  revalidatePath('/account')
  revalidatePath('/dashboard/patient')
  redirect(`/account?booked=${id}`)
}

/** A review can only be left by a signed-in user, and only once per doctor. */
export async function submitReview(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const slug = String(formData.get('slug') ?? '')
  const rating = Number(formData.get('rating') ?? 0)
  const comment = String(formData.get('comment') ?? '').trim()

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: 'Choose a rating between 1 and 5.' }
  }
  if (comment.length < 10) {
    return { error: 'Please write at least a sentence so it is useful to other patients.' }
  }
  if (comment.length > 1000) {
    return { error: 'Please keep the review under 1000 characters.' }
  }

  const doctor = await findDoctorBySlug(slug)
  if (!doctor) return { error: 'That doctor is no longer listed.' }

  const user = await currentUser()
  if (!user) return { error: 'Please log in to leave a review.' }

  if (await hasReviewed(slug, user.id)) {
    return { error: 'You have already reviewed this doctor.' }
  }

  /* The whole integrity claim rests on this line. A rating may only be left
     by someone the clinician has confirmed they actually saw — not by anyone
     who can reach the page while signed in. Reviews are filed under the
     public slug; the booking records the stable id, so resolve across. */
  if (!(await hasAttendedBooking(user.id, doctor.id))) {
    return {
      error:
        'Reviews can only be left after a visit the clinic has confirmed you attended. ' +
        'If you have just been seen, it may take a moment to appear.',
    }
  }

  await addReview({
    doctorId: slug,
    userId: user.id,
    authorName: user.name || `Patient ${user.phone.slice(-4)}`,
    rating,
    comment,
  })

  /* Keep the denormalised average on the doctor row in step. */
  const { average, count } = await ratingFor(slug)
  await updateDoctorRating(slug, average, count)

  await logActivity({
    kind: 'review.created',
    message: `Review left for ${doctor.name} (${rating}/5)`,
    userId: user.id,
  })

  revalidatePath(`/doctor/${slug}`)
  return { ok: true }
}

/* ------------------------------------------------------------ clinic side */

export async function saveChartNote(formData: FormData) {
  const doctor = await requireRole('doctor', '/practice/patients')
  const patientId = String(formData.get('patientId') ?? '')

  await addChartNote({
    patientId,
    doctorId: doctor.id,
    complaints: String(formData.get('complaints') ?? '').trim() || undefined,
    observations: String(formData.get('observations') ?? '').trim() || undefined,
    diagnosis: String(formData.get('diagnosis') ?? '').trim() || undefined,
  })

  await logActivity({
    kind: 'chart.note',
    message: `Clinical note saved for patient ${patientId}`,
    userId: doctor.id,
  })

  revalidatePath('/practice/patients')
}

export async function savePrescription(formData: FormData) {
  const doctor = await requireRole('doctor', '/practice/patients')
  const patientId = String(formData.get('patientId') ?? '')
  const patientName = String(formData.get('patientName') ?? '')

  let drugs: PrescribedDrug[] = []
  try {
    drugs = JSON.parse(String(formData.get('drugs') ?? '[]')) as PrescribedDrug[]
  } catch {
    drugs = []
  }
  if (drugs.length === 0) return

  await addPrescription({
    patientId,
    patientName,
    doctorId: doctor.id,
    doctorName: doctor.name,
    drugs,
    advice: String(formData.get('advice') ?? '').trim() || undefined,
  })

  await logActivity({
    kind: 'prescription.created',
    message: `Prescription with ${drugs.length} drug(s) for ${patientName}`,
    userId: doctor.id,
  })

  revalidatePath('/practice/patients')
}
