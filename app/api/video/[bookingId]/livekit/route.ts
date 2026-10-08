import {currentUser} from '@/lib/auth'
import {livekitJoin} from '@/lib/domain/livekit'
import {consumeLimits} from '@/lib/domain/rate-limit'
import {sameOrigin,errorResponse} from '@/lib/http'
export const runtime='nodejs'
export async function POST(request:Request,{params}:{params:Promise<{bookingId:string}>}){
 if(!sameOrigin(request))return Response.json({error:'Origin required.'},{status:403,headers:{'Cache-Control':'private, no-store'}})
 const u=await currentUser();if(!u)return Response.json({error:'Sign in required.'},{status:401,headers:{'Cache-Control':'private, no-store'}})
 try{const limit=await consumeLimits([{bucket:'livekit-join',key:u.id,limit:5,seconds:60}]);if(!limit.allowed)return Response.json({error:'Retry shortly.'},{status:429,headers:{'Retry-After':String(limit.retryAfterSeconds),'Cache-Control':'private, no-store'}})
 const {bookingId}=await params;return Response.json(await livekitJoin(u.id,bookingId),{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}})
 }catch(e){return errorResponse(e)}
}
