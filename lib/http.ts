import {DomainError} from './domain/errors'
import {localMode} from './secrets'
export function sameOrigin(request:Request) {
 const origin=request.headers.get('origin')
 if(!origin)return false
 const target=new URL(request.url)
 if(origin===target.origin)return true
 // Next's local request URL may use localhost even when the browser used 127.0.0.1.
 // Use the actual Host only for loopback at the same port, never a forwarded header.
 if(!localMode())return false
 try{const host=request.headers.get('host');if(!host)return false;const actual=new URL(target.protocol+'//'+host)
 return !actual.username&&!actual.password&&!actual.search&&!actual.hash&&actual.pathname==='/'&&['localhost','127.0.0.1','[::1]'].includes(actual.hostname)&&actual.port===target.port&&origin===actual.origin
 }catch{return false}
}
export function errorResponse(error:unknown) {
 return Response.json({error:error instanceof DomainError?error.message:'The operation could not be completed.'},
  {status:error instanceof DomainError?error.status:500,headers:{'Cache-Control':'private, no-store'}})
}
export async function boundedBody(request:Request,maximum:number) {
 const reader=request.body?.getReader();if(!reader)return new Uint8Array()
 const chunks:Uint8Array[]=[];let count=0
 try{while(true){const {value,done}=await reader.read();if(done)break;count+=value.length;if(count>maximum){await reader.cancel();throw new DomainError('SIZE','Request too large.',413)}chunks.push(value)}}finally{reader.releaseLock()}
 const result=new Uint8Array(count);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length}return result
}
