import {timingSafeEqual,createHash} from 'node:crypto'
import {privateKey} from '@/lib/secrets'
import {boundedBody,errorResponse} from '@/lib/http'
import {getDb,ensureSchema} from '@/lib/db/client'
import {runLocalWork} from '@/lib/domain/maintenance'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function POST(request:Request){
 const timestamp=request.headers.get('x-worker-time')??'',nonce=request.headers.get('x-worker-nonce')??'',signature=request.headers.get('x-worker-signature')??''
 if(!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>60000||!/^[a-f0-9-]{36}$/.test(nonce)||!/^[a-f0-9]{64}$/.test(signature))return new Response('Worker authorization required',{status:401})
 try{const bytes=await boundedBody(request,1000),digest=createHash('sha256').update(bytes).digest('hex'),expected=privateKey('worker',`POST:/api/internal/worker:${timestamp}:${nonce}:${digest}`)
 if(!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(expected,'hex')))return new Response('Worker authorization required',{status:401})
 await ensureSchema();const fresh=await getDb().one("INSERT INTO worker_runs(id,expires_at) VALUES($1,now()+interval '2 minutes') ON CONFLICT DO NOTHING RETURNING id",[nonce]);if(!fresh)return new Response('Worker request already used',{status:409})
 const result=await runLocalWork(20);return Response.json(result,{headers:{'Cache-Control':'private, no-store'}})
 }catch(error){return errorResponse(error)}
}
