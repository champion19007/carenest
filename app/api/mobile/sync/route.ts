import {mobileActor,syncMobileIntent} from '@/lib/domain/mobile'
import {boundedBody,errorResponse} from '@/lib/http'
export const runtime='nodejs'
export async function POST(r:Request){try{const actor=await mobileActor(r,true),body=JSON.parse(new TextDecoder().decode(await boundedBody(r,5000)));return Response.json(await syncMobileIntent(actor.user_id,body),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return errorResponse(e)}}
