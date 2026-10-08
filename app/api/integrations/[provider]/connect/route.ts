import {requireRole} from '@/lib/auth'
import {beginVideoConnection} from '@/lib/domain/video'
import {errorResponse} from '@/lib/http'
export const dynamic='force-dynamic'
export async function GET(request:Request,{params}:{params:Promise<{provider:string}>}){const user=await requireRole('doctor','/practice/integrations');try{const{provider}=await params;const url=await beginVideoConnection(user.id,provider,new URL(request.url).origin);return Response.redirect(url,302)}catch(error){return errorResponse(error)}}
