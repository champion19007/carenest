import { NextResponse, type NextRequest } from 'next/server'
import { CLAIMS_COOKIE, verifyClaims } from '@/lib/jwt'

/**
 * Edge routing and a first authorisation pass.
 *
 * Browsing is public — search, doctor profiles, labs, surgeries and pet care
 * are all indexable, which is how patients arrive from a search engine. The
 * gate falls when someone tries to reserve a slot or open records that belong
 * to a person.
 *
 * This verifies the JWT signature rather than trusting the cookie's presence,
 * so an obviously-wrong role is rejected before a function even starts. It is
 * NOT the only check: middleware runs on the edge and cannot open a database
 * connection, so it cannot know whether a session has been revoked. Every
 * protected page re-checks against Postgres via `currentUser()`.
 */

const PRIVATE = ['/account', '/dashboard', '/book', '/welcome']
const CLINICIAN_ONLY = '/practice'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const needsClinician = pathname === CLINICIAN_ONLY || pathname.startsWith(`${CLINICIAN_ONLY}/`)
  const needsAuth =
    needsClinician || PRIVATE.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  if (!needsAuth) return NextResponse.next()

  const token = request.cookies.get(CLAIMS_COOKIE)?.value
  const claims = token ? await verifyClaims(token) : null

  if (!claims) return redirectToLogin(request, pathname)

  /* A patient must not reach the clinic app, which holds other people's
     records. The page re-checks this against the database too. */
  if (needsClinician && claims.role !== 'doctor') {
    const denied = request.nextUrl.clone()
    denied.pathname = '/account'
    denied.search = '?denied=practice'
    return NextResponse.redirect(denied)
  }

  /* Hand the verified claims downstream as headers the app can trust —
     services never read these from the client, only from here. */
  const headers = new Headers(request.headers)
  headers.set('x-data-scope', claims.data_scope)
  headers.set('x-tenant-region', claims.tenant_region)
  headers.set('x-subject-role', claims.role)

  return NextResponse.next({ request: { headers } })
}

function redirectToLogin(request: NextRequest, pathname: string) {
  const login = request.nextUrl.clone()
  login.pathname = '/sign-in'
  login.search = ''
  login.searchParams.set('next', pathname)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: [
    '/account/:path*',
    '/dashboard/:path*',
    '/practice/:path*',
    '/book/:path*',
    '/welcome',
  ],
}
