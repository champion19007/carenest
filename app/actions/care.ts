'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { currentUser, requireRole, requireUser } from '@/lib/auth'
import { findDoctorBySlug } from '@/lib/db/sql'
import { requestAppointment, cancelAppointment, rescheduleAppointment,checkInAppointment } from '@/lib/domain/bookings'
import {getDb} from '@/lib/db/client'
import { createAttendedReview } from '@/lib/domain/reviews'
import { writeClinicalRecord } from '@/lib/domain/clinical'
import { DomainError } from '@/lib/domain/errors'
import { consumeLimits } from '@/lib/domain/rate-limit'
export type BookingState={error?:string;notice?:string}
export type ReviewState={error?:string;ok?:boolean}
export type ClinicalState={error?:string;notice?:string}
export async function bookAppointment(_prev:BookingState,form:FormData):Promise<BookingState> {
  const slug=String(form.get('slug')??'')
  const user=await requireUser(`/book/${encodeURIComponent(slug)}`)
  const doctor=await findDoctorBySlug(slug)
  if(!doctor) return {error:'That provider is not currently listed.'}
  let appointment
  try {
    const existing=await getDb().one('SELECT id FROM patient.bookings WHERE user_id=$1 AND idempotency_key=$2',[user.id,String(form.get('requestKey')??'')])
    const limited=existing?{allowed:true,retryAfterSeconds:0}:await consumeLimits([{bucket:'booking-minute',key:user.id,limit:5,seconds:60},{bucket:'booking-hour',key:user.id,limit:20,seconds:3600}])
    if(!limited.allowed) return {error:`Please wait ${limited.retryAfterSeconds} seconds before another request.`}
    appointment=await requestAppointment({actorId:user.id,doctorId:doctor.id,slotId:String(form.get('slotId')??''),mode:String(form.get('kind')??'clinic'),
      familyId:String(form.get('patientFor')??'')||null,petId:String(form.get('petId')??'')||null,
      idempotencyKey:String(form.get('requestKey')??''),consent:form.get('consent')==='on',videoConsent:form.get('videoConsent')==='on',addressId:String(form.get('addressId')??'')})
  } catch(error) { if(error instanceof DomainError) return {error:error.message};throw error }
  revalidatePath('/account');revalidatePath('/practice/requests');revalidatePath('/dashboard/patient')
  redirect(`/account?requested=${encodeURIComponent(appointment.id)}`)
}
export async function cancelBooking(_prev:BookingState,form:FormData):Promise<BookingState> {
  const user=await requireUser('/account')
  try { await cancelAppointment(user.id,String(form.get('bookingId')??''),Number(form.get('revision'))); }
  catch(error) {if(error instanceof DomainError) return {error:error.message};throw error}
  revalidatePath('/account');revalidatePath('/practice/requests')
  return {notice:'Appointment cancelled.'}
}
export async function rescheduleBooking(_prev:BookingState,form:FormData):Promise<BookingState> {
  const user=await requireUser('/account')
  try {await rescheduleAppointment(user.id,String(form.get('bookingId')??''),String(form.get('slotId')??''),Number(form.get('revision')))}
  catch(error) {if(error instanceof DomainError)return {error:error.message};throw error}
  revalidatePath('/account');revalidatePath('/practice/requests')
  return {notice:'New time requested. Awaiting clinic confirmation.'}
}
export async function checkInBooking(_prev:BookingState,form:FormData):Promise<BookingState> {
  const user=await requireUser('/account')
  try{await checkInAppointment(user.id,String(form.get('bookingId')??''))}
  catch(error){if(error instanceof DomainError)return {error:error.message};throw error}
  revalidatePath('/account');revalidatePath('/practice/calendar');return {notice:'You are checked in. The clinic can see your arrival.'}
}
export async function submitReview(_prev:ReviewState,form:FormData):Promise<ReviewState> {
  const user=await currentUser(),slug=String(form.get('slug')??'')
  if(!user)return {error:'Please sign in.'}
  const doctor=await findDoctorBySlug(slug)
  if(!doctor)return {error:'That provider is unavailable.'}
  try {await createAttendedReview(user.id,doctor.id,Number(form.get('rating')),String(form.get('comment')??''))}
  catch(error){if(error instanceof DomainError)return {error:error.message};throw error}
  revalidatePath(`/doctor/${slug}`);return {ok:true}
}
export async function saveChartNote(_prev:ClinicalState,form:FormData):Promise<ClinicalState> {
  const user=await requireRole('doctor','/practice/patients')
  try {await writeClinicalRecord({actorId:user.id,encounterId:String(form.get('encounterId')??''),kind:'chart_notes',requestKey:String(form.get('requestKey')??''),body:{complaints:String(form.get('complaints')??''),observations:String(form.get('observations')??''),diagnosis:String(form.get('diagnosis')??'')}})}
  catch(error){if(error instanceof DomainError)return {error:error.message};throw error}
  revalidatePath('/practice/patients');return {notice:'Clinical note saved to this encounter.'}
}
export async function savePrescription(_prev:ClinicalState,form:FormData):Promise<ClinicalState> {
  const user=await requireRole('doctor','/practice/patients')
  let drugs:unknown
  try {const raw=String(form.get('drugs')??'[]');if(raw.length>20000)throw new Error();drugs=JSON.parse(raw)}
  catch{return {error:'Check the prescribed medicines.'}}
  try {await writeClinicalRecord({actorId:user.id,encounterId:String(form.get('encounterId')??''),kind:'prescriptions',requestKey:String(form.get('requestKey')??''),body:{drugs,advice:String(form.get('advice')??'')}})}
  catch(error){if(error instanceof DomainError)return {error:error.message};throw error}
  revalidatePath('/practice/patients');return {notice:'Prescription saved to this encounter.'}
}
