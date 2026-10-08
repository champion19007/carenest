import {currentUser} from '@/lib/auth'
import {createPaymentOrder} from '@/lib/domain/billing'
import {boundedBody,sameOrigin,errorResponse} from '@/lib/http'
import {consumeLimits} from '@/lib/domain/rate-limit'
export async function POST(request:Request){const user=await currentUser();if(!user)return Response.json({error:'Sign in required.'},{status:401});if(!sameOrigin(request))return Response.json({error:'Invalid origin.'},{status:403});try{const limit=await consumeLimits([{bucket:'payments',key:user.id,limit:5,seconds:600}]);if(!limit.allowed)return Response.json({error:'Retry later.'},{status:429,headers:{'Retry-After':String(limit.retryAfterSeconds)}});const body=JSON.parse(new TextDecoder().decode(await boundedBody(request,2000))) as {invoiceId:string;requestKey:string};return Response.json(await createPaymentOrder(user.id,String(body.invoiceId??''),String(body.requestKey??'')),{headers:{'Cache-Control':'private, no-store'}})}catch(error){return errorResponse(error)}}
