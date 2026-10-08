import {currentUser,currentAdmin} from '@/lib/auth'
import {downloadPrivateFile} from '@/lib/domain/files'
import {errorResponse} from '@/lib/http'
export const runtime='nodejs'
export async function GET(_request:Request,{params}:{params:Promise<{fileId:string}>}){
 try{const [user,admin]=await Promise.all([currentUser(),currentAdmin()]),{fileId}=await params,result=await downloadPrivateFile(user?.id??null,admin?.id??null,fileId)
 return new Response(new Uint8Array(result.bytes),{headers:{'Content-Type':result.file.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(result.file.original_name).replace(/'/g,'%27')}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})}catch(error){return errorResponse(error)}
}
