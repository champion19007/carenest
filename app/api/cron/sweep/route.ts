import {timingSafeEqual} from 'node:crypto'
import {runLocalWork} from '@/lib/domain/maintenance'
export const dynamic='force-dynamic'
export async function GET(request:Request){const secret=process.env.CRON_SECRET;if(!secret)return new Response('Scheduler not configured; use the signed local worker',{status:503});const supplied=request.headers.get('authorization')??'',expected='Bearer '+secret;if(supplied.length!==expected.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return new Response('Unauthorized',{status:401});return Response.json(await runLocalWork(),{headers:{'Cache-Control':'private, no-store'}})}
