import {NextResponse} from 'next/server'
import {deploymentIssue} from '@/lib/runtime-config'
import {getDb} from '@/lib/db/client'
import {LATEST_MIGRATION} from '@/lib/db/migrations'
import {reportError} from '@/lib/observability'
export const dynamic='force-dynamic'
export async function GET(){
 const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex'}
 if(deploymentIssue())return NextResponse.json({status:'unavailable',code:'SETUP_REQUIRED'},{status:503,headers})
 let timer:ReturnType<typeof setTimeout>|undefined
 try{
  // A fresh read, rather than the cached schema promise, detects an outage after startup.
  const ready=await Promise.race([getDb().one('SELECT version FROM public.schema_migrations WHERE version=$1',[LATEST_MIGRATION]),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Health timeout')),8000)})])
  if(!ready)throw new Error('Migrations pending')
  return NextResponse.json({status:'ready',database:'ok',commit:process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,7)??null},{headers})
 }catch(error){reportError(error,'health.database_unavailable');return NextResponse.json({status:'unavailable',code:'DATABASE_NOT_READY'},{status:503,headers})}
 finally{clearTimeout(timer)}
}
