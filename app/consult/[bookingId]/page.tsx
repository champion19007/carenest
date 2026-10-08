import Link from 'next/link'
import {requireUser} from '@/lib/auth'
import {getDb,ensureSchema} from '@/lib/db/client'
import {notFound} from 'next/navigation'
import {LivekitConsultation} from '@/components/livekit-consultation'
export const dynamic='force-dynamic'
export default async function Consultation({params}:{params:Promise<{bookingId:string}>}){
 const {bookingId}=await params,u=await requireUser('/consult/'+bookingId);await ensureSchema()
 const b=await getDb().one<{video_provider:string;room_provider:string|null}>(`SELECT d.video_provider,r.provider room_provider FROM patient.bookings b JOIN provider.doctors d ON d.id=b.doctor_id LEFT JOIN video_sessions r ON r.booking_id=b.id AND r.revision=b.revision WHERE b.id=$1 AND b.kind='video' AND (b.user_id=$2 OR d.user_id=$2)`,[bookingId,u.id]);if(!b)notFound()
 const provider=b.room_provider??b.video_provider
 return <main className="care-container py-8"><Link href="/account">← Appointments</Link><h1 className="my-5 text-3xl">Video consultation</h1>{provider==='livekit'?<LivekitConsultation bookingId={bookingId}/>:provider==='google'?<><p className="mb-5">This appointment uses the clinician’s connected Google Meet account.</p><a className="care-button" href={`/api/video/${bookingId}/join`}>Join Google Meet</a></>:<p>This appointment uses a retired video service. Contact the clinic to rebook using LiveKit.</p>}</main>
}
