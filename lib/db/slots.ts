import 'server-only'
import {materializeSlots} from './schedule-materializer'
import {getDb,ensureSchema} from './client'
import {sweepAppointmentHolds} from '@/lib/domain/bookings'
export type SlotStatus='AVAILABLE'|'HELD'|'BOOKED'|'ATTENDED'|'NO_SHOW'|'BLOCKED'
export type Slot={slot_id:string;doctor_id:string;slot_start:string;slot_end:string;kind:string;status:SlotStatus;locked_by:string|null;locked_until:string|null;reserved_booking_id:string|null;version:number}
export const HOLD_MINUTES=30
async function db(){await ensureSchema();return getDb()}
export async function ensureSlots(doctorId:string,days=7){return materializeSlots(await db(),doctorId,days)}
export async function openSlots(doctorId:string,days=7):Promise<Slot[]> {
  return (await db()).query<Slot>(`SELECT s.* FROM provider.appointment_slots s JOIN provider.doctors d ON d.id=s.doctor_id
    WHERE s.doctor_id=$1 AND d.status='ACTIVE' AND s.slot_start>now() AND s.slot_start<now()+($2||' days')::interval
    AND (s.status='AVAILABLE' OR (s.status='HELD' AND s.locked_until<now()))
    AND NOT EXISTS(SELECT 1 FROM provider.schedule_exceptions e WHERE e.doctor_id=s.doctor_id AND e.day=(s.slot_start AT TIME ZONE 'Asia/Kolkata')::date AND e.closed)
    ORDER BY s.slot_start`,[doctorId,String(Math.min(14,Math.max(1,days)))])
}
export async function findSlot(id:string){return (await db()).one<Slot>('SELECT * FROM provider.appointment_slots WHERE slot_id=$1',[id])}
/** Legacy low-level transitions require exact booking ownership; new writes use domain transactions. */
export async function holdSlot(input:{slotId:string;userId:string;bookingId?:string;minutes?:number}) {
 if(!input.bookingId)return false
 const rows=await(await db()).query(`UPDATE provider.appointment_slots s SET status='HELD',locked_by=$2,reserved_booking_id=$3,locked_until=now()+interval '30 minutes',version=version+1
 WHERE slot_id=$1 AND slot_start>now() AND status='AVAILABLE' AND EXISTS(SELECT 1 FROM patient.bookings b WHERE b.id=$3 AND b.user_id=$2 AND b.slot_id=s.slot_id AND b.status='requested') RETURNING slot_id`,[input.slotId,input.userId,input.bookingId])
 return rows.length>0
}
export async function confirmSlot(slotId:string,bookingId?:string){if(!bookingId)return false;const rows=await(await db()).query("UPDATE provider.appointment_slots SET status='BOOKED',locked_until=NULL,version=version+1 WHERE slot_id=$1 AND reserved_booking_id=$2 AND status='HELD' AND locked_until>now() AND slot_start>now() RETURNING slot_id",[slotId,bookingId]);return rows.length>0}
export async function releaseSlot(slotId:string,bookingId?:string){if(!bookingId)return false;const rows=await(await db()).query("UPDATE provider.appointment_slots SET status='AVAILABLE',reserved_booking_id=NULL,locked_by=NULL,locked_until=NULL,version=version+1 WHERE slot_id=$1 AND reserved_booking_id=$2 AND status IN ('HELD','BOOKED') RETURNING slot_id",[slotId,bookingId]);return rows.length>0}
export async function closeSlot(slotId:string,to:'ATTENDED'|'NO_SHOW',bookingId?:string){if(!bookingId)return false;const rows=await(await db()).query("UPDATE provider.appointment_slots SET status=$2,version=version+1 WHERE slot_id=$1 AND reserved_booking_id=$3 AND status='BOOKED' AND slot_start<=now() RETURNING slot_id",[slotId,to,bookingId]);return rows.length>0}
export const sweepExpiredHolds=()=>sweepAppointmentHolds()
