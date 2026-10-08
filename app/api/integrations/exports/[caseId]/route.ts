import {currentUser} from '@/lib/auth'
import {exportHumanRecordBundle} from '@/lib/domain/integration-cases'
import {errorResponse} from '@/lib/http'
export const runtime='nodejs'
export async function GET(_r:Request,{params}:{params:Promise<{caseId:string}>}){const u=await currentUser();if(!u)return new Response('Sign in required',{status:401});try{const{caseId}=await params;return new Response(JSON.stringify(await exportHumanRecordBundle(u.id,caseId),null,2),{headers:{'Content-Type':'application/fhir+json','Content-Disposition':'attachment; filename="carenest-human-source-bundle.json"','Cache-Control':'private, no-store'}})}catch(e){return errorResponse(e)}}
