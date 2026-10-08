import {requireRole} from '@/lib/auth'
import {completeVideoConnection,integrationOrigin} from '@/lib/domain/video'
import {errorResponse} from '@/lib/http'
export const dynamic='force-dynamic'
export async function GET(request:Request,{params}:{params:Promise<{provider:string}>}){const user=await requireRole('doctor','/practice/integrations');try{const{provider}=await params,url=new URL(request.url),code=url.searchParams.get('code'),state=url.searchParams.get('state');if(!code||!state)return Response.json({error:'Connection was cancelled or invalid.'},{status:400});await completeVideoConnection(user.id,provider,state,code);return Response.redirect(integrationOrigin(url.origin)+'/practice/integrations?connected=1',303)}catch(error){return errorResponse(error)}}
