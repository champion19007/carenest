import { NextResponse, type NextRequest } from 'next/server'

/**
 * Browsing is public; booking and private data are not.
 *
 * Search, provider profiles, lab packages, surgeries and pet care are all
 * indexable — that is how patients find the site from Google, and it is the
 * model Practo and Zocdoc use. The account gate falls at the moment someone
 * tries to reserve a slot or open records that belong to a person.
 *
 * This only checks that a session cookie is present. The cookie is opaque and
 * the session is validated against SQLite in `currentUser()` — middleware runs
 * on the edge runtime and cannot open the database, so it must never be the
 * only check.
 */
const PRIVATE = ['/account', '/dashboard', '/practice', '/book']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isPrivate = PRIVATE.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
  if (!isPrivate) return NextResponse.next()

  if (request.cookies.get('carenest_session')) return NextResponse.next()

  const login = request.nextUrl.clone()
  login.pathname = '/sign-in'
  login.search = ''
  login.searchParams.set('next', pathname)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/account/:path*', '/dashboard/:path*', '/practice/:path*', '/book/:path*'],
}
