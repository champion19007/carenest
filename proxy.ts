import { NextResponse, type NextRequest } from 'next/server'
const privatePaths=['/account','/dashboard','/practice','/staff','/book','/welcome','/admin','/consult','/api/me','/api/queue','/api/files','/api/video','/api/mobile','/api/integrations/exports']
export function proxy(request:NextRequest) {
  const path=request.nextUrl.pathname
  const response=NextResponse.next()
  response.headers.set('X-Content-Type-Options','nosniff')
  response.headers.set('Referrer-Policy','same-origin')
  response.headers.set('X-Frame-Options','DENY')
  if(privatePaths.some(prefix=>path===prefix||path.startsWith(prefix+'/')) || (path==='/search'&&request.nextUrl.searchParams.has('q'))) response.headers.set('Cache-Control','private, no-store')
  // Every protected page/action checks current database permissions and revocation.
  return response
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']}
