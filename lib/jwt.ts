import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

/**
 * Signed claims, readable on the edge.
 *
 * This exists alongside the database session rather than replacing it, because
 * the two answer different questions:
 *
 *   JWT      — "what does this request claim to be?" Verifiable in middleware,
 *              which runs on the edge runtime and cannot open a database
 *              connection. Stateless, fast, and unrevokable until it expires.
 *   Session  — "is this still valid?" Authoritative, revocable, checked in
 *              server components before anything touches patient data.
 *
 * Neither is sufficient alone. Middleware uses the JWT to route and to reject
 * obviously-wrong roles cheaply; the page then re-checks against Postgres.
 *
 * No `server-only` import here: middleware needs this on the edge.
 */

export const CLAIMS_COOKIE = 'carenest_claims'

export type DataScope =
  | 'phi:self' // a patient, their own records
  | 'phi:panel' // a clinician, records of patients who booked with them
  | 'phi:none' // no PHI access at all
  | 'rx:fulfilment' // pharmacy — prescription fulfilment fields only

export type Claims = {
  sub: string
  role: 'patient' | 'doctor' | 'pharmacy' | 'admin'
  tenant_region: string
  data_scope: DataScope
  kyc_level: 'unverified' | 'pending' | 'verified'
}

/** Scope follows from role — it is never taken from client input. */
export function scopeForRole(role: Claims['role']): DataScope {
  switch (role) {
    case 'patient':
      return 'phi:self'
    case 'doctor':
      return 'phi:panel'
    case 'pharmacy':
      return 'rx:fulfilment'
    case 'admin':
      return 'phi:none'
  }
}

function secret() {
  const value = process.env.JWT_SECRET
  if (!value || value.length < 32) {
    /* A weak signing key is the same as no signature at all, so fail loudly
       rather than issuing forgeable tokens. */
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set to at least 32 characters in production')
    }
    return new TextEncoder().encode('dev-only-insecure-secret-please-set-JWT_SECRET')
  }
  return new TextEncoder().encode(value)
}

export async function signClaims(claims: Claims, ttlSeconds = 60 * 60 * 24 * 30) {
  return new SignJWT({ ...claims } as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer('carenest')
    .setAudience('carenest-app')
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret())
}

export async function verifyClaims(token: string): Promise<Claims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: 'carenest',
      audience: 'carenest-app',
    })
    if (!payload.sub || typeof payload.role !== 'string') return null
    return {
      sub: payload.sub,
      role: payload.role as Claims['role'],
      tenant_region: String(payload.tenant_region ?? 'IN-MH'),
      data_scope: payload.data_scope as DataScope,
      kyc_level: (payload.kyc_level as Claims['kyc_level']) ?? 'unverified',
    }
  } catch {
    /* Expired, tampered, or signed with a different key. */
    return null
  }
}
