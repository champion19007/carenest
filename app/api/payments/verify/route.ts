import {currentUser} from '@/lib/auth'
import {verifyCheckout} from '@/lib/domain/billing'
import {boundedBody,sameOrigin,errorResponse} from '@/lib/http'
export async function POST(request:Request){const user=await currentUser();if(!user)return Response.json({error:'Sign in required.'},{status:401});if(!sameOrigin(request))return Response.json({error:'Invalid origin.'},{status:403});try{const body=JSON.parse(new TextDecoder().decode(await boundedBody(request,2000)));return Response.json(await verifyCheckout(user.id,String(body.razorpay_order_id??''),String(body.razorpay_payment_id??''),String(body.razorpay_signature??'')),{headers:{'Cache-Control':'private, no-store'}})}catch(error){return errorResponse(error)}}
