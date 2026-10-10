import { randomBytes,createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { STATE_COOKIE, PKCE_COOKIE,authorizeUrl, googleIsConfigured } from '@/lib/google'
import {currentUser} from '@/lib/auth'
import {localMode} from '@/lib/secrets'

/** Starts the Google flow. */
export async function GET(request: NextRequest) {
  if (!googleIsConfigured()) {
    return NextResponse.redirect(new URL('/sign-in?error=google-not-configured', request.url))
  }

  const next = (request.nextUrl.searchParams.get('next') ?? '').slice(0,1000)
  const link=request.nextUrl.searchParams.get('intent')==='link',user=link?await currentUser():null
  if(link&&(!user||user.status!=='ACTIVE'))return NextResponse.redirect(new URL('/sign-in?error=account-link-required',request.url))

  /* The state is random, stored httpOnly, and compared on the way back.
     Without it a third party could feed this callback their own code and have
     the victim end up signed in as the attacker. The destination rides inside
     the state so it cannot be tampered with separately. */
  const state = Buffer.from(JSON.stringify({nonce:randomBytes(16).toString('hex'),next,linkUserId:link?user!.id:undefined})).toString('base64url')
  const verifier=randomBytes(32).toString('base64url')

  const jar = await cookies()
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'&&!localMode(),
    path: '/',
    maxAge: 10 * 60,
  })
  jar.set(PKCE_COOKIE,verifier,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production'&&!localMode(),path:'/',maxAge:600})

  return NextResponse.redirect(authorizeUrl(state, request.nextUrl.origin,createHash('sha256').update(verifier).digest('base64url')))
}
