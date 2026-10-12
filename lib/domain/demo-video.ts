import 'server-only'
import {getDb,ensureSchema,type Db} from '@/lib/db/client'
import {hostedDemoVideoHostId} from '@/lib/demo-booking'
import {localMode} from '@/lib/secrets'
import {reject} from './errors'

export async function demoVideoHost(db:Db){
 const id=!localMode()?hostedDemoVideoHostId():null
 if(!id)return null
 return (await db.one<{id:string}>("SELECT id FROM patient.users WHERE id=$1 AND status='ACTIVE'",[id]))?.id??null
}
export async function assertDemoVideoWindow(db:Db,hostId:string,startsAt:string,endsAt:string,exceptId:string|null=null){
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['demo-video-host:'+hostId])
 if(await db.one(`SELECT b.id FROM patient.bookings b JOIN provider.doctors d ON d.id=b.doctor_id JOIN provider.appointment_slots s ON s.reserved_booking_id=b.id
  WHERE d.is_demo AND b.kind='video' AND ($3::text IS NULL OR b.id<>$3) AND b.status IN ('requested','confirmed') AND b.starts_at<$2::timestamptz AND b.ends_at>$1::timestamptz
  AND (s.status='BOOKED' OR (s.status='HELD' AND s.locked_until>clock_timestamp())) LIMIT 1`,[startsAt,endsAt,exceptId]))reject('OVERLAP','The demo host already has a call at this time.')
}
export async function demoHostAppointments(actorId:string){
 await ensureSchema();const db=getDb()
 if(await demoVideoHost(db)!==actorId)reject('NOT_FOUND','Demo hosting is unavailable.',404)
 return db.query<{id:string;doctor_name:string;starts_at:string;ends_at:string}>(`SELECT b.id,d.name doctor_name,b.starts_at,b.ends_at
 FROM patient.bookings b JOIN provider.doctors d ON d.id=b.doctor_id
 WHERE d.is_demo AND d.status='ACTIVE' AND d.video_provider='livekit' AND b.kind='video' AND b.status='confirmed'
 AND b.user_id<>$1 AND b.ends_at>now()-interval '30 minutes'
 AND EXISTS(SELECT 1 FROM patient.consents c WHERE c.booking_id=b.id AND c.actor_id=b.user_id AND c.purpose='video-provider' AND c.revoked_at IS NULL)
 ORDER BY b.starts_at LIMIT 100`,[actorId])
}
