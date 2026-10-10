import {NextResponse} from 'next/server'
import {deploymentIssue} from '@/lib/runtime-config'
import {ensureSchema} from '@/lib/db/client'
export const dynamic='force-dynamic'
export async function GET(){
 const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex'}
 if(deploymentIssue())return NextResponse.json({status:'unavailable',code:'SETUP_REQUIRED'},{status:503,headers})
 try{await ensureSchema();return NextResponse.json({status:'ready'},{headers})}
 catch{return NextResponse.json({status:'unavailable',code:'DATABASE_NOT_READY'},{status:503,headers})}
}
