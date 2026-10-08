'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { respondAppointment, finishAppointment,startAppointment } from '@/lib/domain/bookings'
import { DomainError } from '@/lib/domain/errors'
export type PracticeState={error?:string;notice?:string}
export async function respondToRequest(_prev:PracticeState,form:FormData):Promise<PracticeState> {
  const user=await requireRole('doctor','/practice/requests'),decision=String(form.get('decision')??'')
  if(decision!=='confirmed'&&decision!=='declined')return {error:'Choose accept or decline.'}
  try {await respondAppointment({actorId:user.id,bookingId:String(form.get('bookingId')??''),decision})}
  catch(error){if(error instanceof DomainError)return {error:error.message};throw error}
  revalidatePath('/practice/requests');revalidatePath('/account')
  return {notice:decision==='confirmed'?'Appointment confirmed.':'Request declined.'}
}
export async function markAttended(_prev:PracticeState,form:FormData):Promise<PracticeState> {
  return finish(form,'attended')
}
export async function markNoShow(_prev:PracticeState,form:FormData):Promise<PracticeState> {
  return finish(form,'no_show')
}
async function finish(form:FormData,outcome:'attended'|'no_show'):Promise<PracticeState> {
  const user=await requireRole('doctor','/practice/requests')
  try {await finishAppointment(user.id,String(form.get('bookingId')??''),outcome)}
  catch(error){if(error instanceof DomainError)return {error:error.message};throw error}
  revalidatePath('/practice/requests');revalidatePath('/account');return {notice:outcome==='attended'?'Marked as attended.':'Marked as no-show.'}
}
export async function beginConsultation(_prev:PracticeState,form:FormData):Promise<PracticeState> {
  const user=await requireRole('doctor','/practice/calendar')
  try{await startAppointment(user.id,String(form.get('bookingId')??''))}
  catch(error){if(error instanceof DomainError)return {error:error.message};throw error}
  revalidatePath('/practice/calendar');return {notice:'Consultation started.'}
}
