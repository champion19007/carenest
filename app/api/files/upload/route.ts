import {currentUser} from '@/lib/auth'
import {uploadPrivateFile} from '@/lib/domain/files'
import {consumeLimits} from '@/lib/domain/rate-limit'
import {boundedBody,sameOrigin,errorResponse} from '@/lib/http'
export const runtime='nodejs'
export async function POST(request:Request){
 const user=await currentUser();if(!user)return Response.json({error:'Sign in required.'},{status:401})
 if(!sameOrigin(request))return Response.json({error:'Invalid request origin.'},{status:403})
 try{
  const limit=await consumeLimits([{bucket:'uploads-minute',key:user.id,limit:10,seconds:60},{bucket:'uploads-day',key:user.id,limit:100,seconds:86400}])
  if(!limit.allowed)return Response.json({error:'Upload limit reached.'},{status:429,headers:{'Retry-After':String(limit.retryAfterSeconds)}})
  const bytes=await boundedBody(request,10600000),parsed=await new Request(request.url,{method:'POST',headers:{'content-type':request.headers.get('content-type')??''},body:new Blob([bytes])}).formData(),file=parsed.get('file')
  if(!(file instanceof File))return Response.json({error:'Choose a file.'},{status:400})
  const result=await uploadPrivateFile(user.id,file.name,new Uint8Array(await file.arrayBuffer()),{encounterId:String(parsed.get('encounterId')??'')||undefined,applicationId:String(parsed.get('applicationId')??'')||undefined,labOrderId:String(parsed.get('labOrderId')??'')||undefined,evidenceKind:String(parsed.get('evidenceKind')??'')||undefined})
  return Response.json(result,{headers:{'Cache-Control':'private, no-store'}})
 }catch(error){return errorResponse(error)}
}
