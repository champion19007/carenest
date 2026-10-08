import {currentUser} from '@/lib/auth'
import {patientRecords} from '@/lib/domain/clinical'
export const dynamic='force-dynamic'
export async function GET(_request:Request,{params}:{params:Promise<{recordId:string}>}) {
 const user=await currentUser();if(!user)return new Response('Sign in required',{status:401})
 const {recordId}=await params,record=(await patientRecords(user.id,{recordId}))[0]
 if(!record)return new Response('Record unavailable',{status:404})
 return new Response(JSON.stringify({id:record.id,type:record.collection,createdAt:record.created_at,content:record.body},null,2),{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="carenest-record.json"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
}
