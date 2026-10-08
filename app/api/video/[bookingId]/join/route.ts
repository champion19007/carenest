import {currentUser} from '@/lib/auth'
import {videoJoin} from '@/lib/domain/video'
import {consumeLimits} from '@/lib/domain/rate-limit'
import {errorResponse} from '@/lib/http'
import {getDb,ensureSchema} from '@/lib/db/client'
export const dynamic='force-dynamic'
export async function GET(_request:Request,{params}:{params:Promise<{bookingId:string}>}){const user=await currentUser();if(!user)return Response.json({error:'Sign in required.'},{status:401});try{const{bookingId}=await params,limited=await consumeLimits([{bucket:'video-join',key:user.id,limit:10,seconds:60}]);if(!limited.allowed)return Response.json({error:'Retry shortly.'},{status:429,headers:{'Retry-After':String(limited.retryAfterSeconds)}});await ensureSchema();const room=await getDb().one<{provider:string}>("SELECT coalesce(r.provider,d.video_provider) provider FROM patient.bookings b JOIN provider.doctors d ON d.id=b.doctor_id LEFT JOIN video_sessions r ON r.booking_id=b.id AND r.revision=b.revision WHERE b.id=$1 AND b.kind='video' AND (b.user_id=$2 OR d.user_id=$2)",[bookingId,user.id]);const target=room?.provider==='livekit'?'/consult/'+encodeURIComponent(bookingId):await videoJoin(user.id,bookingId);return new Response(null,{status:303,headers:{Location:target,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}})}catch(error){return errorResponse(error)}}
