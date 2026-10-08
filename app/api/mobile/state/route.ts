import {mobileActor,mobileSnapshot} from '@/lib/domain/mobile'
import {errorResponse} from '@/lib/http'
export const runtime='nodejs'
export async function GET(r:Request){try{const actor=await mobileActor(r);return Response.json(await mobileSnapshot(actor.user_id),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return errorResponse(e)}}
