import {boundedBody,errorResponse} from '@/lib/http'
import {acceptCashfreeWebhook} from '@/lib/domain/cashfree-webhooks'
export async function POST(request:Request){
 try{const raw=await boundedBody(request,1000000);await acceptCashfreeWebhook(raw,request.headers.get('x-webhook-timestamp')??'',request.headers.get('x-webhook-signature')??'');return Response.json({accepted:true},{headers:{'Cache-Control':'no-store'}})}catch(error){return errorResponse(error)}
}
