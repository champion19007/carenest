import { NextResponse, type NextRequest } from 'next/server'
import {deploymentIssue,setupPageAllowed} from '@/lib/runtime-config'
const privatePaths=['/account','/dashboard','/practice','/staff','/book','/welcome','/admin','/consult','/api/me','/api/queue','/api/files','/api/video','/api/mobile','/api/integrations/exports']
export function proxy(request:NextRequest) {
  const path=request.nextUrl.pathname
  const incomplete=deploymentIssue()!==null
  let response
  if(incomplete&&(!setupPageAllowed(path)||request.method!=='GET'&&request.method!=='HEAD')){
    if(path==='/api'||path.startsWith('/api/')||request.method!=='GET'&&request.method!=='HEAD')response=NextResponse.json({error:'CareNest is not ready to accept requests.',code:'SETUP_REQUIRED'},{status:503})
    else response=NextResponse.rewrite(new URL('/deployment-unavailable',request.url))
    response.headers.set('Cache-Control','no-store')
    response.headers.set('X-Robots-Tag','noindex, nofollow')
  }else response=NextResponse.next()
  response.headers.set('X-Content-Type-Options','nosniff')
  response.headers.set('Referrer-Policy','same-origin')
  response.headers.set('X-Frame-Options','DENY')
  if(privatePaths.some(prefix=>path===prefix||path.startsWith(prefix+'/')) || (path==='/search'&&request.nextUrl.searchParams.has('q'))) response.headers.set('Cache-Control','private, no-store')
  // Every protected page/action checks current database permissions and revocation.
  return response
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']}
