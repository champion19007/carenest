import 'server-only'
import {getDb,ensureSchema} from './client'
export type QueueStatus={ahead:number;delayMinutes:number;estimatedStart:string;arriveBy:string;scheduledStart:string;isNext:boolean;isDone:boolean;measuredAt:string;estimated:boolean}
async function db(){await ensureSchema();return getDb()}
/** Only a checked-in, confirmed, current reservation on the current IST day has a position. */
export async function queueStatusFor(bookingId:string):Promise<QueueStatus|undefined> {
 const d=await db(),b=await d.one<{doctor_id:string;slot_id:string;starts_at:string;checked_in_at:string;status:string}>(`SELECT b.* FROM patient.bookings b JOIN provider.appointment_slots s ON s.slot_id=b.slot_id AND s.reserved_booking_id=b.id
 WHERE b.id=$1 AND b.status='confirmed' AND s.status='BOOKED' AND b.checked_in_at IS NOT NULL
 AND (b.starts_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date`,[bookingId])
 if(!b)return undefined
 const ahead=await d.one<{n:string}>(`SELECT count(*) n FROM patient.bookings other JOIN provider.appointment_slots s ON s.reserved_booking_id=other.id
 WHERE other.doctor_id=$1 AND other.status='confirmed' AND other.id<>$2 AND other.checked_in_at IS NOT NULL
 AND (other.starts_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date
 AND (other.started_at IS NOT NULL OR (other.checked_in_at,other.id)<($3::timestamptz,$2::text))`,[b.doctor_id,bookingId,b.checked_in_at])
 const recent=await d.one<{minutes:string|null}>(`SELECT avg(extract(epoch FROM (attended_at-started_at))/60) minutes FROM (SELECT attended_at,started_at FROM patient.bookings WHERE doctor_id=$1 AND status='attended' AND started_at IS NOT NULL AND attended_at>started_at ORDER BY attended_at DESC LIMIT 20) visits`,[b.doctor_id])
 const walkIns=await d.one<{n:string}>(`SELECT count(*) n FROM clinic.walk_ins WHERE doctor_id=$1 AND state IN ('WAITING','IN_PROGRESS') AND (checked_in_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date AND (state='IN_PROGRESS' OR checked_in_at<=$2::timestamptz)`,[b.doctor_id,b.checked_in_at])
 const count=Number(ahead?.n??0)+Number(walkIns?.n??0),duration=Math.min(120,Math.max(5,Number(recent?.minutes??15))),now=Date.now(),estimated=Math.max(now,new Date(b.starts_at).getTime())+count*duration*60000
 return {ahead:count,delayMinutes:Math.max(0,Math.round((estimated-new Date(b.starts_at).getTime())/60000)),estimatedStart:new Date(estimated).toISOString(),arriveBy:new Date(now).toISOString(),scheduledStart:b.starts_at,isNext:count===0,isDone:false,measuredAt:new Date(now).toISOString(),estimated:true}
}
export async function queueForDoctor(doctorId:string) {
 return (await db()).query<{slot_id:string;slot_start:string;status:string;booking_id:string;patient_name:string}>(`SELECT s.slot_id,s.slot_start,s.status,b.id booking_id,coalesce(p.name,f.name,u.name) patient_name
 FROM provider.appointment_slots s JOIN patient.bookings b ON b.id=s.reserved_booking_id JOIN patient.users u ON u.id=b.user_id
 LEFT JOIN patient.family_members f ON f.id=b.patient_for AND f.user_id=b.user_id LEFT JOIN patient.pets p ON p.id=b.pet_id AND p.owner_id=b.user_id
 WHERE s.doctor_id=$1 AND b.status='confirmed' AND b.checked_in_at IS NOT NULL AND s.status='BOOKED'
 AND (s.slot_start AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date ORDER BY b.checked_in_at,b.id`,[doctorId])
}
