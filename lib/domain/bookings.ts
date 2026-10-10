import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { ensureSchema, getDb, type Db } from '@/lib/db/client'
import { localMode,encryptSecret } from '@/lib/secrets'
import {homeAddressSnapshot} from './home-visits'
import {livekitConfigured} from './livekit'
import { boundedText, reject } from './errors'
import {cashfreeConfigured} from '@/lib/cashfree'

export const REQUEST_HOLD_MINUTES = 30
export const PAYMENT_HOLD_MINUTES = 10
type Appointment = { id: string; user_id: string; doctor_id: string; slot_id: string; status: string;
  kind: string; patient_for: string | null; pet_id: string | null; starts_at: string; ends_at: string;
  fee: number; revision: number; request_hash: string; started_at: string | null; payment_required:boolean }
type Provider = { id: string; user_id: string | null; status: string; verified_at: string | null; is_demo: boolean;
  clinic_id:string|null;
  kind: string; fee: number; video: boolean; home_visit: boolean; supported_species: string[]; video_provider:string }
type Slot = { slot_id: string; doctor_id: string; status: string; slot_start: string; slot_end: string;
  reserved_booking_id: string | null; locked_until: string | null }

async function ready() { await ensureSchema(); return getDb() }
async function actor(tx: Db, id: string) {
  const row = await tx.one<{ id: string; role: string; kyc_level: string; status: string }>(
    'SELECT id,role,kyc_level,status FROM patient.users WHERE id=$1 FOR SHARE', [id])
  if (!row || row.status !== 'ACTIVE') reject('FORBIDDEN', 'Your account cannot perform this action.', 403)
  return row
}
async function provider(tx: Db, id: string) {
  const row = await tx.one<Provider>('SELECT * FROM provider.doctors WHERE id=$1 FOR UPDATE', [id])
  if (!row || row.status !== 'ACTIVE' || (!row.verified_at && !(row.is_demo && localMode()))) {
    reject('PROVIDER_UNAVAILABLE', 'This provider is not currently accepting appointments.', 409)
  }
  if(!(row.is_demo&&localMode())) {
    const account=row.user_id?await tx.one<{role:string;status:string;kyc_level:string}>('SELECT role,status,kyc_level FROM patient.users WHERE id=$1 FOR SHARE',[row.user_id]):undefined
    if(!account||account.status!=='ACTIVE'||account.role!=='doctor'||account.kyc_level!=='verified')reject('PROVIDER_UNAVAILABLE','This provider is not currently accepting appointments.')
  }
  if(await tx.one("SELECT id FROM clinic.clinics WHERE id=(SELECT clinic_id FROM provider.doctors WHERE id=$1) AND status<>'ACTIVE'",[id]))reject('PROVIDER_UNAVAILABLE','This clinic is not currently accepting appointments.')
  return row
}
async function practitioner(tx: Db, actorId: string, doctorId: string) {
  const user = await actor(tx, actorId)
  const doctor = await provider(tx, doctorId)
  if (doctor.user_id !== actorId || user.role !== 'doctor' || user.kyc_level !== 'verified') {
    reject('FORBIDDEN', 'An active verified practitioner is required.', 403)
  }
  return doctor
}
async function lockSlot(tx: Db, id: string) {
  const row = await tx.one<Slot>('SELECT * FROM provider.appointment_slots WHERE slot_id=$1 FOR UPDATE', [id])
  if (!row) reject('SLOT_UNAVAILABLE', 'That appointment time is unavailable.')
  return row
}
async function event(tx: Db, appointment: Appointment, actorId: string | null, from: string | null, reason = '') {
  await tx.query('INSERT INTO appointment_history(booking_id,actor_id,from_status,to_status,revision,reason) VALUES ($1,$2,$3,$4,$5,$6)',
    [appointment.id, actorId, from, appointment.status, appointment.revision, reason])
  await tx.query('INSERT INTO audit_log(actor_id,action,resource,detail) VALUES($1,$2,$3,$4::jsonb)',
    [actorId, 'appointment:' + appointment.status, appointment.id, JSON.stringify({ revision: appointment.revision })])
  await tx.query('INSERT INTO domain_events(kind,subject_id,payload,event_key) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT DO NOTHING',
    ['booking.' + appointment.status, appointment.id, JSON.stringify({ userId: appointment.user_id, revision: appointment.revision }),
      `booking:${appointment.id}:${appointment.revision}:${appointment.status}`])
}
async function change(tx: Db, b: Appointment, actorId: string | null, to: string, reason = '') {
  const next = await tx.one<Appointment>(`UPDATE patient.bookings SET status=$2,revision=revision+1,
    cancelled_at=CASE WHEN $2='cancelled' THEN now() ELSE cancelled_at END,
    attended_at=CASE WHEN $2='attended' THEN now() ELSE attended_at END WHERE id=$1 RETURNING *`, [b.id, to])
  await event(tx, next!, actorId, b.status, reason)
  return next!
}
async function expireSlot(tx: Db, slot: Slot) {
  if (slot.status !== 'HELD') return
  const clock = await tx.one<{ expired: boolean }>('SELECT $1::timestamptz <= clock_timestamp() AS expired', [slot.locked_until])
  if (!clock?.expired) return
  if (slot.reserved_booking_id) {
    const old = await tx.one<Appointment>('SELECT * FROM patient.bookings WHERE id=$1 FOR UPDATE', [slot.reserved_booking_id])
    if (old?.status === 'requested') {
      await change(tx, old, null, 'expired', old.payment_required?'Payment window elapsed':'Clinic response window elapsed')
      await tx.query("UPDATE clinic.invoices SET state='VOID' WHERE booking_id=$1 AND state='UNPAID'",[old.id])
    }
  }
  await tx.query("UPDATE provider.appointment_slots SET status='AVAILABLE',reserved_booking_id=NULL,locked_by=NULL,locked_until=NULL,version=version+1 WHERE slot_id=$1", [slot.slot_id])
  slot.status = 'AVAILABLE'; slot.reserved_booking_id = null
}
async function future(tx: Db, slot: Slot) {
  const row = await tx.one<{ valid: boolean }>('SELECT $1::timestamptz > clock_timestamp() AS valid', [slot.slot_start])
  if (!row?.valid) reject('PAST_SLOT', 'Choose an appointment time in the future.', 400)
}
export async function requestAppointment(input: {
  actorId: string; doctorId: string; slotId: string; mode: string; familyId?: string | null; petId?: string | null;
  idempotencyKey: string; consent: boolean; videoConsent?:boolean; addressId?:string; paymentRequired?:boolean;
}) {
  boundedText(input.idempotencyKey, 128, 16)
  if (!['clinic', 'video', 'home_visit'].includes(input.mode)) reject('MODE', 'Choose a supported consultation mode.', 400)
  if (!input.consent) reject('CONSENT', 'Please agree to share the necessary appointment details with the clinic.', 400)
  if(input.paymentRequired&&!cashfreeConfigured())reject('NOT_CONFIGURED','Cashfree sandbox checkout is not configured yet.',503)
  if(input.mode==='video'&&!input.videoConsent)reject('CONSENT','Agree to use the selected external meeting provider for this consultation.',400)
  const requestHash = createHash('sha256').update(JSON.stringify([input.doctorId,input.slotId,input.mode,input.familyId ?? null,input.petId ?? null,'appointment-v1',...(input.mode==='home_visit'?['home-v1',input.addressId??null]:[]),...(input.paymentRequired?['prepaid-v1']:[])])).digest('hex')
  return (await ready()).transaction(async tx => {
    // Serialize this account's new intents/pending count; slot locks arbitrate across accounts.
    await tx.query('SELECT id FROM patient.users WHERE id=$1 FOR UPDATE', [input.actorId])
    await actor(tx, input.actorId)
    const existing = await tx.one<Appointment>('SELECT * FROM patient.bookings WHERE user_id=$1 AND idempotency_key=$2', [input.actorId,input.idempotencyKey])
    if (existing) {
      if (existing.request_hash !== requestHash) reject('IDEMPOTENCY_CONFLICT', 'This request key was already used for different details.')
      return existing
    }
    const d = await provider(tx, input.doctorId)
    if(input.paymentRequired&&!d.clinic_id)reject('CLINIC','This provider needs a registered clinic before collecting payment.')
    const home=input.mode==='home_visit'?await homeAddressSnapshot(tx,input.actorId,input.addressId??''):null
    if(home&&!d.clinic_id)reject('CLINIC','A registered dispatch clinic is required for this home visit.')
    if(!Number.isInteger(Number(d.fee)) || Number(d.fee)<0 || Number(d.fee)>1000000) reject('FEE','The clinic needs to correct its consultation fee.')
    if ((input.mode === 'video' && !d.video) || (input.mode === 'home_visit' && !d.home_visit)) reject('MODE', 'This provider does not offer that consultation mode.', 400)
    if(input.mode==='video'&&(!d.user_id||!await tx.one("SELECT id FROM patient.users WHERE id=$1 AND role='doctor' AND kyc_level='verified' AND status='ACTIVE'",[d.user_id])))reject('CONNECTION','A current verified clinician account is required for a video appointment.')
    if(input.mode==='video'&&(d.video_provider==='livekit'?!livekitConfigured():!await tx.one("SELECT id FROM provider.connections WHERE user_id=$1 AND provider='google' AND revoked_at IS NULL",[d.user_id])))reject('CONNECTION','The selected video service must be configured before accepting video requests.')
    if (input.familyId && input.petId) reject('SUBJECT', 'Choose one patient or pet.', 400)
    if (d.kind === 'vet') {
      const pet = await tx.one<{ species: string }>('SELECT species FROM patient.pets WHERE id=$1 AND owner_id=$2 AND archived_at IS NULL FOR SHARE', [input.petId,input.actorId])
      if (!pet || !d.supported_species.includes(pet.species) || input.familyId) reject('SUBJECT', 'Choose an owned pet that this veterinarian treats.', 403)
    } else {
      if (input.petId) reject('SUBJECT', 'Choose a veterinarian for a pet.', 400)
      if (input.familyId && !await tx.one('SELECT id FROM patient.family_members WHERE id=$1 AND user_id=$2 AND archived_at IS NULL FOR SHARE', [input.familyId,input.actorId])) reject('SUBJECT', 'That household member is unavailable.', 403)
    }
    const pending = await tx.one<{ n: string }>(`SELECT count(*) n FROM patient.bookings b JOIN provider.appointment_slots s ON s.reserved_booking_id=b.id
      WHERE b.user_id=$1 AND b.status='requested' AND s.locked_until>now()`, [input.actorId])
    if (Number(pending?.n) >= 3) reject('PENDING_LIMIT', 'Wait for the clinic to respond to your current requests.')
    const slot = await lockSlot(tx, input.slotId)
    if(await tx.one("SELECT day FROM provider.schedule_exceptions WHERE doctor_id=$1 AND day=($2::timestamptz AT TIME ZONE 'Asia/Kolkata')::date AND closed=true",[d.id,slot.slot_start])) reject('SLOT_UNAVAILABLE','The clinic is closed on that date.')
    if (slot.doctor_id !== d.id) reject('SLOT_UNAVAILABLE', 'Choose a time on this provider’s calendar.')
    await future(tx, slot); await expireSlot(tx, slot)
    if (slot.status !== 'AVAILABLE') reject('SLOT_UNAVAILABLE', 'Someone else took that time. Please choose another.')
    if(await tx.one(`SELECT b.id FROM patient.bookings b JOIN provider.appointment_slots s ON s.reserved_booking_id=b.id
      WHERE b.doctor_id=$1 AND b.status IN ('requested','confirmed') AND s.slot_start<$3::timestamptz AND s.slot_end>$2::timestamptz
      AND (s.status='BOOKED' OR (s.status='HELD' AND s.locked_until>clock_timestamp())) LIMIT 1`,[d.id,slot.slot_start,slot.slot_end]))reject('OVERLAP','This clinician already has an overlapping appointment.')
    const id = 'bkg_' + randomUUID()
    const booking = await tx.one<Appointment>(`INSERT INTO patient.bookings(id,user_id,doctor_id,slot_id,kind,slot,fee,status,patient_for,pet_id,starts_at,ends_at,idempotency_key,request_hash,payment_required)
      VALUES($1,$2,$3,$4,$5,$6,$7,'requested',$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [id,input.actorId,d.id,slot.slot_id,input.mode,slot.slot_start,d.fee,input.familyId ?? null,input.petId ?? null,slot.slot_start,slot.slot_end,input.idempotencyKey,requestHash,!!input.paymentRequired])
    await tx.query(`UPDATE provider.appointment_slots SET status='HELD',reserved_booking_id=$2,locked_by=$3,
      locked_until=least(now()+($4::int * interval '1 minute'),slot_start),version=version+1 WHERE slot_id=$1`, [slot.slot_id,id,input.actorId,input.paymentRequired?PAYMENT_HOLD_MINUTES:REQUEST_HOLD_MINUTES])
    if(home){await tx.query('UPDATE patient.bookings SET home_address_id=$2,encrypted_home_address=$3 WHERE id=$1',[id,input.addressId,encryptSecret(JSON.stringify(home),'booking-home:'+id)]);await tx.query('INSERT INTO clinic.home_visits(booking_id,clinic_id) VALUES($1,$2)',[id,d.clinic_id])}
    await tx.query('INSERT INTO patient.consents(id,actor_id,purpose,subject_id,booking_id,version) VALUES($1,$2,$3,$4,$5,$6)',
      ['cns_'+randomUUID(),input.actorId,'appointment-sharing',input.petId ?? input.familyId ?? input.actorId,id,'appointment-v1'])
    await event(tx, booking!, input.actorId, null)
    if(input.mode==='video')await tx.query("INSERT INTO patient.consents(id,actor_id,purpose,subject_id,booking_id,version) VALUES($1,$2,'video-provider',$3,$4,'video-v1')",['cns_'+randomUUID(),input.actorId,input.petId??input.familyId??input.actorId,id])
    if(input.paymentRequired){
      await tx.query("INSERT INTO clinic.invoices(id,booking_id,user_id,total_paise,state) VALUES($1,$2,$3,$4,$5)",[ 'inv_'+randomUUID(),id,input.actorId,String(d.fee*100),d.fee===0?'WAIVED':'UNPAID'])
      if(d.fee===0){await confirmPaidAppointment(tx,booking!);return (await tx.one<Appointment>('SELECT * FROM patient.bookings WHERE id=$1',[id]))!}
    }
    return booking!
  })
}

async function lockedAppointment(tx: Db, id: string) {
  const initial = await tx.one<Appointment>('SELECT * FROM patient.bookings WHERE id=$1', [id])
  if (!initial) reject('NOT_FOUND', 'That appointment is unavailable.', 404)
  const slot = await lockSlot(tx, initial.slot_id)
  const b = await tx.one<Appointment>('SELECT * FROM patient.bookings WHERE id=$1 FOR UPDATE', [id])
  if (!b || b.slot_id !== slot.slot_id) reject('CHANGED', 'The appointment changed. Refresh and try again.')
  return { b, slot }
}
// All payment and payout operations use provider -> slot -> booking -> invoice locks.
export async function lockPaymentAppointment(tx:Db,id:string){
  const initial=await tx.one<Appointment>('SELECT * FROM patient.bookings WHERE id=$1',[id])
  if(!initial)reject('NOT_FOUND','Appointment unavailable.',404)
  await tx.query('SELECT id FROM provider.doctors WHERE id=$1 FOR UPDATE',[initial.doctor_id])
  return lockedAppointment(tx,id)
}
export async function confirmPaidAppointment(tx:Db,b:Appointment){
  if(!b.payment_required)return true
  const valid=await tx.one(`SELECT b.id FROM patient.bookings b JOIN provider.appointment_slots s ON s.slot_id=b.slot_id
    JOIN provider.doctors d ON d.id=b.doctor_id JOIN clinic.clinics c ON c.id=d.clinic_id
    JOIN patient.users u ON u.id=b.user_id LEFT JOIN patient.users du ON du.id=d.user_id
    WHERE b.id=$1 AND b.status='requested' AND s.reserved_booking_id=b.id AND s.status='HELD'
    AND s.locked_until>clock_timestamp() AND s.slot_start>clock_timestamp() AND c.status='ACTIVE' AND u.status='ACTIVE'
    AND d.status='ACTIVE' AND (d.verified_at IS NOT NULL OR ($2::boolean AND d.is_demo))
    AND (($2::boolean AND d.is_demo) OR (du.status='ACTIVE' AND du.role='doctor' AND du.kyc_level='verified'))
    AND EXISTS(SELECT 1 FROM patient.consents WHERE booking_id=b.id AND purpose='appointment-sharing' AND revoked_at IS NULL)
    AND (b.kind<>'video' OR EXISTS(SELECT 1 FROM patient.consents WHERE booking_id=b.id AND purpose='video-provider' AND revoked_at IS NULL))
    AND (b.patient_for IS NULL OR EXISTS(SELECT 1 FROM patient.family_members f WHERE f.id=b.patient_for AND f.user_id=b.user_id AND f.archived_at IS NULL))
    AND (b.pet_id IS NULL OR EXISTS(SELECT 1 FROM patient.pets p WHERE p.id=b.pet_id AND p.owner_id=b.user_id AND p.archived_at IS NULL AND p.species=ANY(d.supported_species)))`,[b.id,localMode()])
  if(!valid)return false
  await tx.query("UPDATE provider.appointment_slots SET status='BOOKED',locked_until=NULL,version=version+1 WHERE slot_id=$1 AND reserved_booking_id=$2",[b.slot_id,b.id])
  await tx.query('INSERT INTO clinic.encounters(id,booking_id,doctor_id,patient_user_id,family_id,pet_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(booking_id) DO NOTHING',['enc_'+randomUUID(),b.id,b.doctor_id,b.user_id,b.patient_for,b.pet_id])
  await change(tx,b,null,'confirmed','Payment verified; published appointment time scheduled')
  return true
}
export async function respondAppointment(input: { actorId: string; bookingId: string; decision: 'confirmed' | 'declined'; revision?: number }) {
  return (await ready()).transaction(async tx => {
    const initial = await tx.one<Appointment>('SELECT * FROM patient.bookings WHERE id=$1', [input.bookingId])
    if (!initial) reject('NOT_FOUND', 'That appointment is unavailable.', 404)
    const d = await practitioner(tx,input.actorId,initial.doctor_id)
    const { b,slot } = await lockedAppointment(tx,input.bookingId)
    if(b.payment_required)reject('PAYMENT_REQUIRED','This appointment is confirmed automatically after verified payment. The patient can cancel an unpaid hold.')
    const live = await tx.one<{ valid: boolean }>('SELECT $1::timestamptz > clock_timestamp() AS valid', [slot.locked_until])
    if (b.status !== 'requested' || slot.reserved_booking_id !== b.id || slot.status !== 'HELD' || !live?.valid || (input.revision !== undefined && b.revision !== input.revision)) reject('STALE_REQUEST','That request expired or changed. It cannot modify a later reservation.')
    await future(tx,slot)
    if(b.patient_for&&!await tx.one('SELECT id FROM patient.family_members WHERE id=$1 AND user_id=$2 AND archived_at IS NULL',[b.patient_for,b.user_id]))reject('SUBJECT','The requested household subject is no longer available.')
    if(b.pet_id&&!await tx.one('SELECT id FROM patient.pets WHERE id=$1 AND owner_id=$2 AND archived_at IS NULL AND species=ANY($3::text[])',[b.pet_id,b.user_id,d.supported_species]))reject('SUBJECT','The requested pet is no longer eligible for this service.')
    await tx.query(`UPDATE provider.appointment_slots SET status=$2,
      locked_until=NULL,locked_by=CASE WHEN $2='AVAILABLE' THEN NULL ELSE locked_by END,
      reserved_booking_id=CASE WHEN $2='AVAILABLE' THEN NULL ELSE reserved_booking_id END,version=version+1
      WHERE slot_id=$1 AND reserved_booking_id=$3`, [slot.slot_id,input.decision === 'confirmed' ? 'BOOKED' : 'AVAILABLE',b.id])
    const next = await change(tx,b,input.actorId,input.decision)
    if (input.decision === 'confirmed') {
      await tx.query(`INSERT INTO clinic.encounters(id,booking_id,doctor_id,patient_user_id,family_id,pet_id)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(booking_id) DO NOTHING`, ['enc_'+randomUUID(),b.id,d.id,b.user_id,b.patient_for,b.pet_id])
      await tx.query(`INSERT INTO clinic.invoices(id,booking_id,user_id,total_paise) VALUES($1,$2,$3,$4)
        ON CONFLICT DO NOTHING`, ['inv_'+randomUUID(),b.id,b.user_id,String(b.fee*100)])
    }
    return next
  })
}
export async function cancelAppointment(actorId: string, bookingId: string, revision?: number) {
  return (await ready()).transaction(async tx => {
    await actor(tx,actorId)
    const { b,slot } = await lockedAppointment(tx,bookingId)
    if (b.user_id !== actorId) reject('FORBIDDEN','That appointment is unavailable.',403)
    if (b.status === 'cancelled') return b
    if (!['requested','confirmed'].includes(b.status) || (revision !== undefined && b.revision !== revision)) reject('CHANGED','That appointment cannot be cancelled now.')
    if (b.started_at) reject('STARTED','Contact the clinic about an appointment already in progress.')
    await future(tx,slot)
    await tx.query("UPDATE provider.appointment_slots SET status='AVAILABLE',reserved_booking_id=NULL,locked_by=NULL,locked_until=NULL,version=version+1 WHERE slot_id=$1 AND reserved_booking_id=$2 AND status IN ('HELD','BOOKED')", [slot.slot_id,b.id])
    await tx.query("UPDATE clinic.invoices SET state='VOID' WHERE booking_id=$1 AND state='UNPAID'",[b.id])
    if(b.payment_required){
      await tx.query('SELECT id FROM clinic.invoices WHERE booking_id=$1 FOR UPDATE',[b.id])
      await tx.query(`INSERT INTO refunds(id,payment_id,amount_paise,reason,requested_by)
        SELECT 'refund_'||gen_random_uuid()::text,p.id,p.amount_paise-coalesce((SELECT sum(r.amount_paise) FROM refunds r WHERE r.payment_id=p.id AND r.state IN ('REQUESTED','APPROVED','SUBMITTING','UNKNOWN','PROCESSED')),0),'Cancelled paid appointment; full remaining refund review',$2
        FROM payment_orders p JOIN clinic.invoices i ON i.id=p.invoice_id WHERE i.booking_id=$1 AND p.state='CAPTURED'
        AND p.amount_paise>coalesce((SELECT sum(r.amount_paise) FROM refunds r WHERE r.payment_id=p.id AND r.state IN ('REQUESTED','APPROVED','SUBMITTING','UNKNOWN','PROCESSED')),0)`,[b.id,actorId])
    }
    await tx.query("UPDATE clinic.home_visits SET state='CANCELLED',revision=revision+1,updated_at=now() WHERE booking_id=$1",[b.id])
    return change(tx,b,actorId,'cancelled')
  })
}
export async function rescheduleAppointment(actorId: string, bookingId: string, newSlotId: string, revision: number) {
  return (await ready()).transaction(async tx => {
    await actor(tx,actorId)
    const initial = await tx.one<Appointment>('SELECT * FROM patient.bookings WHERE id=$1', [bookingId])
    if (!initial || initial.user_id !== actorId) reject('FORBIDDEN','That appointment is unavailable.',403)
    await provider(tx,initial.doctor_id)
    for (const id of [...new Set([initial.slot_id,newSlotId])].sort()) await lockSlot(tx,id)
    const { b,slot:oldSlot } = await lockedAppointment(tx,bookingId)
    const nextSlot = await lockSlot(tx,newSlotId)
    if (b.revision !== revision || !['requested','confirmed'].includes(b.status) || b.started_at || oldSlot.reserved_booking_id !== b.id) reject('CHANGED','That appointment changed. Refresh before rescheduling.')
    if (newSlotId === b.slot_id) return b
    if(b.payment_required&&b.status==='requested')reject('PAYMENT_REQUIRED','Cancel this unpaid hold and choose a new time before paying.')
    if (nextSlot.doctor_id !== b.doctor_id) reject('SLOT_UNAVAILABLE','Choose a time with the same provider.')
    await future(tx,nextSlot); await expireSlot(tx,nextSlot)
    if (nextSlot.status !== 'AVAILABLE') reject('SLOT_UNAVAILABLE','That replacement time is already taken. Your original appointment is unchanged.')
    if(await tx.one("SELECT day FROM provider.schedule_exceptions WHERE doctor_id=$1 AND day=($2::timestamptz AT TIME ZONE 'Asia/Kolkata')::date AND closed=true",[b.doctor_id,nextSlot.slot_start]))reject('SLOT_UNAVAILABLE','The clinic is closed on that date.')
    if(await tx.one(`SELECT b.id FROM patient.bookings b JOIN provider.appointment_slots s ON s.reserved_booking_id=b.id WHERE b.doctor_id=$1 AND b.id<>$4 AND b.status IN ('requested','confirmed') AND s.slot_start<$3::timestamptz AND s.slot_end>$2::timestamptz AND (s.status='BOOKED' OR (s.status='HELD' AND s.locked_until>clock_timestamp())) LIMIT 1`,[b.doctor_id,nextSlot.slot_start,nextSlot.slot_end,b.id]))reject('OVERLAP','The replacement time overlaps another consultation.')
    await tx.query("UPDATE provider.appointment_slots SET status='AVAILABLE',reserved_booking_id=NULL,locked_by=NULL,locked_until=NULL,version=version+1 WHERE slot_id=$1 AND reserved_booking_id=$2", [oldSlot.slot_id,b.id])
    await tx.query("UPDATE provider.appointment_slots SET status=$4,reserved_booking_id=$2,locked_by=$3,locked_until=CASE WHEN $4='BOOKED' THEN NULL ELSE least(now()+interval '30 minutes',slot_start) END,version=version+1 WHERE slot_id=$1", [newSlotId,b.id,actorId,b.payment_required?'BOOKED':'HELD'])
    await tx.query('UPDATE patient.bookings SET slot_id=$2,starts_at=$3::text::timestamptz,ends_at=$4::text::timestamptz,slot=$3::text WHERE id=$1', [b.id,newSlotId,nextSlot.slot_start,nextSlot.slot_end])
    return change(tx,b,actorId,b.payment_required?'confirmed':'requested',b.payment_required?'Paid appointment rescheduled; payment retained':'Rescheduled; awaiting clinic confirmation')
  })
}
export async function finishAppointment(actorId: string, bookingId: string, outcome: 'attended' | 'no_show') {
  return (await ready()).transaction(async tx => {
    const initial = await tx.one<Appointment>('SELECT * FROM patient.bookings WHERE id=$1', [bookingId])
    if (!initial) reject('NOT_FOUND','That appointment is unavailable.',404)
    await practitioner(tx,actorId,initial.doctor_id)
    const { b,slot } = await lockedAppointment(tx,bookingId)
    const time = await tx.one<{ started: boolean }>('SELECT $1::timestamptz <= now() AS started', [slot.slot_start])
    if (b.status !== 'confirmed' || slot.status !== 'BOOKED' || slot.reserved_booking_id !== b.id || !(time?.started||(outcome==='attended'&&b.started_at))) reject('STATE','Only a current confirmed appointment can be closed after its scheduled start or actual consultation start.')
    if(outcome==='no_show'&&b.started_at)reject('STATE','A consultation already started cannot be marked as a no-show.')
    await tx.query('UPDATE provider.appointment_slots SET status=$2,version=version+1 WHERE slot_id=$1', [slot.slot_id,outcome === 'attended' ? 'ATTENDED' : 'NO_SHOW'])
    await tx.query("UPDATE clinic.encounters SET state='CLOSED',closed_at=now() WHERE booking_id=$1", [b.id])
    return change(tx,b,actorId,outcome)
  })
}
export async function sweepAppointmentHolds(limit = 100) {
  return (await ready()).transaction(async tx => {
    const slots = await tx.query<Slot>("SELECT * FROM provider.appointment_slots WHERE status='HELD' AND locked_until<=now() ORDER BY slot_id LIMIT $1 FOR UPDATE SKIP LOCKED", [limit])
    for (const slot of slots) await expireSlot(tx,slot)
    return slots.length
  })
}

export async function checkInAppointment(actorId:string,bookingId:string) {
  return (await ready()).transaction(async tx=>{
    await actor(tx,actorId)
    const {b,slot}=await lockedAppointment(tx,bookingId)
    if(b.user_id!==actorId)reject('FORBIDDEN','That appointment is unavailable.',403)
    const time=await tx.one<{valid:boolean}>("SELECT now() BETWEEN $1::timestamptz-interval '60 minutes' AND $2::timestamptz+interval '60 minutes' AS valid",[b.starts_at,b.ends_at])
    if(b.status!=='confirmed'||slot.reserved_booking_id!==b.id||!time?.valid)reject('STATE','Check in near the confirmed appointment time.')
    await tx.query('UPDATE patient.bookings SET checked_in_at=coalesce(checked_in_at,now()) WHERE id=$1',[b.id])
  })
}
export async function startAppointment(actorId:string,bookingId:string) {
  return (await ready()).transaction(async tx=>{
    const initial=await tx.one<Appointment>('SELECT b.* FROM patient.bookings b JOIN provider.doctors d ON d.id=b.doctor_id WHERE b.id=$1 AND d.user_id=$2',[bookingId,actorId])
    if(!initial)reject('NOT_FOUND','Appointment unavailable.',404)
    await tx.query('SELECT id FROM provider.doctors WHERE id=$1 FOR UPDATE',[initial.doctor_id])
    await practitioner(tx,actorId,initial.doctor_id)
    const {b,slot}=await lockedAppointment(tx,bookingId)
    if(b.status!=='confirmed'||slot.reserved_booking_id!==b.id)reject('STATE','Only a current confirmed appointment can begin.')
    const window=await tx.one<{allowed:boolean}>("SELECT now() BETWEEN $1::timestamptz-interval '60 minutes' AND $2::timestamptz+interval '60 minutes' allowed",[b.starts_at,b.ends_at])
    if(!window?.allowed)reject('WINDOW','Start a consultation near its scheduled time.')
    if(await tx.one("SELECT id FROM patient.bookings WHERE doctor_id=$1 AND id<>$2 AND status='confirmed' AND started_at IS NOT NULL UNION ALL SELECT id FROM clinic.walk_ins WHERE doctor_id=$1 AND state='IN_PROGRESS' LIMIT 1",[b.doctor_id,b.id]))reject('IN_PROGRESS','Complete the current assigned consultation before starting another.')
    await tx.query('UPDATE patient.bookings SET started_at=coalesce(started_at,now()),checked_in_at=coalesce(checked_in_at,now()) WHERE id=$1',[b.id])
    await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'appointment:start',$2)",[actorId,b.id])
  })
}
