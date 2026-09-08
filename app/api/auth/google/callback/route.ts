import { timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { STATE_COOKIE, exchangeCode, googleIsConfigured } from '@/lib/google'
import { destinationForUser } from '@/lib/routes'
import { newId, startSession } from '@/lib/auth'
import { ensureSelfMember } from '@/lib/db/family'
import { logActivity } from '@/lib/db/docs'
import {
  createUser,
  findUserByEmail,
  findUserByGoogleSub,
  linkGoogleAccount,
  touchLogin,
} from '@/lib/db/sql'

function fail(request: NextRequest, reason: string) {
  return NextResponse.redirect(new URL(`/sign-in?error=${reason}`, request.url))
}

/** Constant time, so a mismatch cannot be probed a character at a time. */
function sameState(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export async function GET(request: NextRequest) {
  if (!googleIsConfigured()) return fail(request, 'google-not-configured')

  const params = request.nextUrl.searchParams
  if (params.get('error')) return fail(request, 'google-cancelled')

  const code = params.get('code')
  const state = params.get('state')
  const jar = await cookies()
  const expected = jar.get(STATE_COOKIE)?.value

  if (!code || !state || !expected || !sameState(state, expected)) {
    return fail(request, 'google-state')
  }
  jar.delete(STATE_COOKIE)

  let identity
  try {
    identity = await exchangeCode(code, request.nextUrl.origin)
  } catch {
    return fail(request, 'google-exchange')
  }

  /* An unverified address proves nothing — anyone can type a string into a
     profile. Matching it to an existing account would be a takeover. */
  if (!identity.emailVerified) return fail(request, 'google-unverified')

  let user = await findUserByGoogleSub(identity.sub)
  if (!user) {
    /* Same person, previously signed up by phone. Google's `sub` is the stable
       identifier — email addresses can be reassigned — so the link is stored
       by sub once established. */
    const byEmail = await findUserByEmail(identity.email)
    if (byEmail) {
      await linkGoogleAccount(byEmail.id, identity.sub)
      user = byEmail
    }
  }

  const isNew = !user
  if (!user) {
    user = await createUser({
      id: newId('usr'),
      email: identity.email,
      googleSub: identity.sub,
      name: identity.name,
    })
    await logActivity({
      kind: 'user.created',
      message: `New account via Google: ${identity.email}`,
      userId: user.id,
    })
  }

  await touchLogin(user.id)
  await startSession(user)
  if (user.name) await ensureSelfMember(user.id, user.name, newId('fam'))
  await logActivity({
    kind: isNew ? 'user.signup' : 'user.login',
    message: `${isNew ? 'Signed up' : 'Logged in'} with Google`,
    userId: user.id,
  })

  /* Google usually supplies a name, but not always — an account with none
     still goes to the profile page to choose one. */
  const next = state.split(':').slice(1).join(':')
  const target = destinationForUser(user, next || undefined)
  return NextResponse.redirect(new URL(target, request.url))
}
