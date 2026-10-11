import {currentUser} from '@/lib/auth'
import {verifyCheckout} from '@/lib/domain/billing'
import {boundedBody,sameOrigin,errorResponse} from '@/lib/http'
import {verifyDemoPayment} from '@/lib/domain/demo-payments'
import {reject} from '@/lib/domain/errors'
import {consumeLimits} from '@/lib/domain/rate-limit'
export async function POST(request:Request){
 const user=await currentUser();if(!user)return Response.json({error:'Sign in required.'},{status:401,headers:{'Cache-Control':'private, no-store'}})
 if(!sameOrigin(request))return Response.json({error:'Invalid origin.'},{status:403})
 try{
  let body;try{body=JSON.parse(new TextDecoder().decode(await boundedBody(request,2000)))}catch{reject('BODY','Invalid verification request.',400)}
  if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.order_id!=='string'||!/^[A-Za-z0-9_-]{3,45}$/.test(body.order_id)||(body.demo!==undefined&&typeof body.demo!=='boolean'))reject('FIELDS','A Cashfree order ID is required.',400)
  const limit=await consumeLimits([{bucket:'payment-verification',key:user.id,limit:15,seconds:60}]);if(!limit.allowed)return Response.json({error:'Retry shortly.'},{status:429,headers:{'Retry-After':String(limit.retryAfterSeconds),'Cache-Control':'private, no-store'}})
  const verify=body.demo===true?verifyDemoPayment:verifyCheckout
  return Response.json(await verify(user.id,body.order_id),{headers:{'Cache-Control':'private, no-store'}})
 }catch(error){return errorResponse(error)}
}
