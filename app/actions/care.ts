'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  createBooking,
  findDoctorBySlug,
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
  const slot = String(formData.get('slot') ?? '')
  const kind = String(formData.get('kind') ?? 'clinic')

  const doctor = await findDoctorBySlug(slug)
  if (!doctor) return { error: 'That doctor is no longer listed.' }
  if (!slot) return { error: 'Choose a time slot first.' }

  const user = await requireUser(`/book/${slug}`)

  const limit = await hitRateLimit('booking:user', user.id, 10, 60)
  if (!limit.allowed) {
    return { error: 'You have made a lot of bookings recently. Please try again later.' }
  }

  /* Don't let the same person hold the same slot twice. */
  const mine = await listBookingsForUser(user.id)
  const existing = mine.find(
    (booking) =>
      booking.doctor_id === doctor.id && booking.slot === slot && booking.status === 'confirmed',
  )
  if (existing) return { error: 'You already have this slot booked.' }

  const id = newId('bkg')
  await createBooking({
    id,
    userId: user.id,
    doctorId: doctor.id,
    kind,
    slot,
    fee: doctor.fee,
  })

  await logActivity({
    kind: 'booking.created',
    message: `${user.name || 'A patient'} booked ${doctor.name} · ${slot}`,
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
