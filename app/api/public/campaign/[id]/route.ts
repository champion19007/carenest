import {recordCampaignEvent} from '@/lib/domain/workspace-marketing'
import {consumeLimits} from '@/lib/domain/rate-limit'
import {networkKey,sameOrigin,errorResponse} from '@/lib/http'
import {siteOrigin} from '@/lib/site-origin'
async function record(request:Request,id:string,kind:'CLICK'|'IMPRESSION'){if(!/^campaign_[a-f0-9-]{36}$/.test(id))return null;const limit=await consumeLimits([{bucket:'campaign-events',key:networkKey(request),limit:60,seconds:60}]);if(!limit.allowed)return null;return recordCampaignEvent(id,kind,networkKey(request))}
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params,slug=await record(request,id,'CLICK');return slug?Response.redirect(siteOrigin()+'/doctor/'+encodeURIComponent(slug),303):new Response('Campaign unavailable',{status:404})}catch(error){return errorResponse(error)}}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){if(!sameOrigin(request))return new Response(null,{status:403});try{const {id}=await params;await record(request,id,'IMPRESSION');return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}})}catch(error){return errorResponse(error)}}
