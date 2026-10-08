import {exchangeMobilePairing} from '@/lib/domain/mobile'
import {boundedBody,errorResponse} from '@/lib/http'
export const runtime='nodejs'
export async function POST(r:Request){try{const body=JSON.parse(new TextDecoder().decode(await boundedBody(r,2000)));return Response.json(await exchangeMobilePairing(String(body.code??'')),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return errorResponse(e)}}
