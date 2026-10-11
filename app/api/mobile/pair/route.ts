import {exchangeMobilePairing} from '@/lib/domain/mobile'
import {boundedBody,errorResponse,networkKey} from '@/lib/http'
export const runtime='nodejs'
export async function POST(r:Request){try{const body=JSON.parse(new TextDecoder().decode(await boundedBody(r,2000)));return Response.json(await exchangeMobilePairing(String(body.code??''),networkKey(r)),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return errorResponse(e)}}
