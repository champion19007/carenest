'use server'
import {requireRole} from '@/lib/auth'
import {revalidatePath} from 'next/cache'
import {setSchedule,closeClinicDate} from '@/lib/domain/practice'
import {DomainError} from '@/lib/domain/errors'
export type ScheduleState={error?:string;notice?:string}
export async function saveSchedule(_prev:ScheduleState,form:FormData):Promise<ScheduleState>{const user=await requireRole('doctor','/practice/settings');const start=String(form.get('start')??'').split(':').map(Number),end=String(form.get('end')??'').split(':').map(Number),duration=Number(form.get('duration'));try{await setSchedule(user.id,form.getAll('weekday').map(day=>({weekday:Number(day),start_minute:start[0]*60+start[1],end_minute:end[0]*60+end[1],duration_minutes:duration})));revalidatePath('/practice/settings');return {notice:'Schedule saved. The local worker will publish eligible times.'}}catch(error){if(error instanceof DomainError)return {error:error.message};throw error}}
export async function saveClosure(_prev:ScheduleState,form:FormData):Promise<ScheduleState>{const user=await requireRole('doctor','/practice/settings');try{await closeClinicDate(user.id,String(form.get('day')??''),String(form.get('reason')??''));revalidatePath('/practice/settings');return {notice:'Closure saved. Existing appointments require individual patient coordination.'}}catch(error){if(error instanceof DomainError)return {error:error.message};throw error}}
