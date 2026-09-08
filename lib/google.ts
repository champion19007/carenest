import { createRemoteJWKSet, jwtVerify } from 'jose'

/**
 * Google sign-in.
 *
 * Only the authorisation-code flow is used. The implicit flow would hand the
 * browser a token directly, which means trusting something the user's own
 * machine could have altered; here the code is exchanged server-side using a
 * secret the browser never sees.
 *
 * The returned ID token is verified against Google's published keys rather
 * than merely decoded. Decoding a JWT tells you what it claims; verifying it
 * tells you Google said so. Skipping that step would let anyone sign in as
 * anyone by pasting in a hand-written token.
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

/* Fetched once and cached; jose refreshes it when Google rotates keys. */
const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

export const STATE_COOKIE = 'carenest_oauth_state'

export function googleIsConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

export function redirectUri(origin: string) {
  /* An explicit APP_URL wins: behind a proxy the request's own origin can be
     the internal one, and Google matches this string exactly. */
  const base = process.env.APP_URL?.replace(/\/$/, '') || origin
  return `${base}/api/auth/google/callback`
}

export function authorizeUrl(state: string, origin: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    /* Ask for a fresh account choice rather than silently reusing whichever
       Google session the browser happens to hold. */
    prompt: 'select_account',
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

export type GoogleIdentity = {
  sub: string
  email: string
  name: string
  emailVerified: boolean
}

export async function exchangeCode(code: string, origin: string): Promise<GoogleIdentity> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(origin),
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    throw new Error(`Google rejected the code exchange (${response.status})`)
  }

  const body = (await response.json()) as { id_token?: string }
  if (!body.id_token) throw new Error('Google returned no ID token')

  const { payload } = await jwtVerify(body.id_token, jwks, {
    issuer: ISSUERS,
    audience: process.env.GOOGLE_CLIENT_ID!,
  })

  const email = typeof payload.email === 'string' ? payload.email : ''
  if (!email) throw new Error('Google returned no email address')

  return {
    sub: String(payload.sub),
    email,
    name: typeof payload.name === 'string' ? payload.name : '',
    emailVerified: payload.email_verified === true,
  }
}
