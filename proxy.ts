import { NextResponse, type NextRequest } from 'next/server'
const privatePaths=['/account','/dashboard','/practice','/staff','/book','/welcome','/admin','/consult','/api/me','/api/queue','/api/files','/api/video','/api/mobile','/api/integrations/exports']
// No setup gate. An incompletely configured deployment serves the real app and
// fails at the point that actually needs the missing piece, which is what you
// want while testing a deployment yourself — a holding page hides which part is
// unconfigured. /api/health still reports readiness, and robots still disallows
// indexing until the environment is complete.
export function proxy(request:NextRequest) {
  const path=request.nextUrl.pathname
  const response=NextResponse.next()
  response.headers.set('X-Content-Type-Options','nosniff')
  response.headers.set('Referrer-Policy','same-origin')
  if(!path.startsWith('/api/public/clinic-widget/'))response.headers.set('X-Frame-Options','DENY')
  if(privatePaths.some(prefix=>path===prefix||path.startsWith(prefix+'/')) || (path==='/search'&&request.nextUrl.searchParams.has('q'))) response.headers.set('Cache-Control','private, no-store')
  // Every protected page/action checks current database permissions and revocation.
  return response
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']}
