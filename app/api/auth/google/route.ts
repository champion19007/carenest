import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { STATE_COOKIE, authorizeUrl, googleIsConfigured } from '@/lib/google'

/** Starts the Google flow. */
export async function GET(request: NextRequest) {
  if (!googleIsConfigured()) {
    return NextResponse.redirect(new URL('/sign-in?error=google-not-configured', request.url))
  }

  const next = request.nextUrl.searchParams.get('next') ?? ''

  /* The state is random, stored httpOnly, and compared on the way back.
     Without it a third party could feed this callback their own code and have
     the victim end up signed in as the attacker. The destination rides inside
     the state so it cannot be tampered with separately. */
  const state = `${randomBytes(16).toString('hex')}:${next}`

  const jar = await cookies()
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  })

  return NextResponse.redirect(authorizeUrl(state, request.nextUrl.origin))
}
