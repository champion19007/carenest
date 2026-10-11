import 'server-only'
import type {Db} from '@/lib/db/client'
import {reject} from './errors'
export async function workspaceWindowFree(tx:Db,doctorId:string,start:string,end:string,excludeVisit:string|null=null,excludeBlock:string|null=null){
 if(await tx.one(`SELECT id FROM clinic.scheduled_visits WHERE doctor_id=$1 AND state='SCHEDULED' AND starts_at<$3::timestamptz AND ends_at>$2::timestamptz AND ($4::text IS NULL OR id<>$4)
 UNION ALL SELECT id FROM clinic.calendar_blocks WHERE doctor_id=$1 AND status='ACTIVE' AND starts_at<$3::timestamptz AND ends_at>$2::timestamptz AND ($5::text IS NULL OR id<>$5) LIMIT 1`,[doctorId,start,end,excludeVisit,excludeBlock]))reject('OVERLAP','This time overlaps a clinic appointment or calendar block.',409)
}
export async function onlineWindowFree(tx:Db,doctorId:string,start:string,end:string){
 if(await tx.one(`SELECT b.id FROM patient.bookings b JOIN provider.appointment_slots s ON s.slot_id=b.slot_id AND s.reserved_booking_id=b.id
 WHERE b.doctor_id=$1 AND b.starts_at<$3::timestamptz AND b.ends_at>$2::timestamptz AND b.status IN ('requested','confirmed')
 AND (s.status='BOOKED' OR s.status='HELD' AND s.locked_until>clock_timestamp()) LIMIT 1`,[doctorId,start,end]))reject('OVERLAP','This time overlaps an online appointment or active payment hold.',409)
}
