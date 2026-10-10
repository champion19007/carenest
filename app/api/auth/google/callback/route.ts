import { timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { STATE_COOKIE, PKCE_COOKIE,exchangeCode, googleIsConfigured } from '@/lib/google'
import { destinationForUser } from '@/lib/routes'
import { currentUser,newId, startSession } from '@/lib/auth'
import {acceptGoogleIdentity} from '@/lib/domain/google-identity'
import {DomainError} from '@/lib/domain/errors'
import { ensureSelfMember } from '@/lib/db/family'
import { logActivity } from '@/lib/db/docs'
import {
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
  const code = params.get('code')
  const state = params.get('state')
  const jar = await cookies()
  const expected = jar.get(STATE_COOKIE)?.value
  const verifier=jar.get(PKCE_COOKIE)?.value
  jar.delete(STATE_COOKIE);jar.delete(PKCE_COOKIE)
  if (params.get('error')) return fail(request, 'google-cancelled')

  if (!code || code.length>4096 || !state || state.length>4096 || !expected || !verifier || !sameState(state, expected)) {
    return fail(request, 'google-state')
  }
  let intent:{next?:string;linkUserId?:string}
  try{intent=JSON.parse(Buffer.from(expected,'base64url').toString('utf8'))}catch{return fail(request,'google-state')}
  if(intent.linkUserId){const current=await currentUser();if(!current||current.id!==intent.linkUserId||current.status!=='ACTIVE')return fail(request,'account-link-required')}

  let identity
  try {
    identity = await exchangeCode(code, request.nextUrl.origin,verifier)
  } catch {
    return fail(request, 'google-exchange')
  }

  /* An unverified address proves nothing — anyone can type a string into a
     profile. Matching it to an existing account would be a takeover. */
  if (!identity.emailVerified) return fail(request, 'google-unverified')

  let accepted
  try{accepted=await acceptGoogleIdentity(identity,intent.linkUserId)}catch(error){return fail(request,error instanceof DomainError&&error.code==='GOOGLE_ACCOUNT'?'google-account':'account-link-required')}
  const {user,isNew}=accepted

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
  const next = intent.linkUserId?'/account/notifications?google=linked':intent.next
  const target = destinationForUser(user, next || undefined)
  return NextResponse.redirect(new URL(target, request.url))
}
