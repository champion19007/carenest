import 'server-only'
import { ensureSchema, getDb } from './client'

/** Upcoming visits use slot timestamps, never saved relative labels. */
export async function nextHomeAppointment(userId: string) {
  await ensureSchema()
  return getDb().one<{ id: string; status: string; doctor_name: string; speciality: string; starts_at: string }>(
    `SELECT b.id, b.status, d.name AS doctor_name, d.speciality, s.slot_start AS starts_at
     FROM patient.bookings b
     JOIN provider.appointment_slots s ON s.slot_id = b.slot_id
     JOIN provider.doctors d ON d.id = b.doctor_id
     WHERE b.user_id = $1 AND b.status IN ('requested', 'confirmed') AND s.slot_start > now()
     ORDER BY s.slot_start, b.id LIMIT 1`,
    [userId],
  )
}
