import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { CLAIMS_COOKIE, scopeForRole, signClaims, type Claims } from '@/lib/jwt'
import { findDoctorByUserId } from '@/lib/db/sql'
import { localMode,tokenHash } from '@/lib/secrets'
import {getDb} from '@/lib/db/client'
import {
  createAdminSession,
  createSession,
  deleteAdminSession,
  deleteSession,
  findAdmin,
  findAdminById,
  findAdminSession,
  findSession,
  findUserById,
  type User,
} from '@/lib/db/sql'

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>

export const SESSION_COOKIE = 'carenest_session'
export const ADMIN_COOKIE = 'carenest_admin'

export function newId(prefix: string) {
  return `${prefix}_${randomBytes(9).toString('hex')}`
}

export function newToken() {
  return randomBytes(32).toString('hex')
}

export function newOtp() {
  return String(randomInt(100_000, 1_000_000))
}

/* ------------------------------------------------------------- passwords */

/**
 * scrypt with a per-user salt. Deliberately slow, so a leaked database is
 * not a leaked password list.
 */
export async function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, salt, 64)
  return { salt, hash: derived.toString('hex') }
}

export async function verifyPassword(password: string, salt: string, expected: string) {
  const derived = await scrypt(password, salt, 64)
  const expectedBuf = Buffer.from(expected, 'hex')
  if (derived.length !== expectedBuf.length) return false
  return timingSafeEqual(derived, expectedBuf)
}

/* -------------------------------------------------------- patient session */

/**
 * Opens a session and issues the matching signed claims.
 *
 * Two cookies, two jobs: the opaque session token is the revocable source of
 * truth checked against Postgres, and the JWT carries claims middleware can
 * verify on the edge without a database connection.
 */
export async function startSession(user: {
  id: string
  role: string
  tenant_region: string
  kyc_level: string
}) {
  const token = newToken()
  const privileged=['doctor','pharmacy'].includes(user.role)
  await createSession(token, user.id, privileged?1/3:30)

  const role = (['patient', 'doctor', 'pharmacy', 'admin'] as const).includes(
    user.role as Claims['role'],
  )
    ? (user.role as Claims['role'])
    : 'patient'

  const claims: Claims = {
    sub: user.id,
    role,
    tenant_region: user.tenant_region,
    /* Derived from role, never accepted from the client. */
    data_scope: scopeForRole(role),
    kyc_level: (user.kyc_level as Claims['kyc_level']) ?? 'unverified',
  }

  const jwt = await signClaims(claims)
  const jar = await cookies()
  const options = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production' && !localMode(),
    path: '/',
    maxAge: privileged?60*60*8:60*60*24*30,
  }
  jar.set(SESSION_COOKIE, token, options)
  jar.set(CLAIMS_COOKIE, jwt, options)
}

export async function endSession() {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) await deleteSession(token)
  jar.delete(SESSION_COOKIE)
  jar.delete(CLAIMS_COOKIE)
}

/** The verified claims for this request, or null. */
export async function currentClaims(): Promise<Claims | null> {
  const user = await currentUser()
  if (!user) return null
  const role = user.role as Claims['role']
  return { sub: user.id, role, tenant_region: user.tenant_region,
    data_scope: scopeForRole(role), kyc_level: user.kyc_level as Claims['kyc_level'] }
}

/** The signed-in user, or null. Safe from any server component. */
export async function currentUser(touch=true): Promise<User | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await findSession(token)
  if (!session) return null

  if (new Date(session.expires_at).getTime() < Date.now()) {
    await deleteSession(token)
    return null
  }

  const user = await findUserById(session.user_id)
  const privileged=user&&(['doctor','pharmacy'].includes(user.role)||Boolean(await getDb().one("SELECT user_id FROM clinic.memberships WHERE user_id=$1 AND status='ACTIVE' LIMIT 1",[user.id])))
  if(privileged&&(Date.now()-new Date(session.created_at).getTime()>8*3600000||Date.now()-new Date(session.last_seen_at).getTime()>30*60000)) {await deleteSession(token);return null}
  if(user&&touch)await getDb().query("UPDATE patient.sessions SET last_seen_at=now() WHERE token=$1 AND last_seen_at<now()-interval '1 minute'",[tokenHash(token)])
  return user&&['ACTIVE','RESTRICTED'].includes(user.status)?user:null
}

/** Sends the caller to /sign-in unless a session exists. */
export async function requireUser(next: string): Promise<User> {
  const user = await currentUser()
  if (user) return user
  redirect(`/sign-in?next=${encodeURIComponent(next)}`)
}

/**
 * Gate for the clinic app. A signed-in patient must not be able to read
 * another patient's queue, so this checks the role rather than just the
 * presence of a session.
 */
export async function requireRole(role: string, next: string): Promise<User> {
  const user = await requireUser(next)
  if(user.status!=='ACTIVE')redirect('/account/privacy?restricted=1')
  if (user.role !== role) redirect('/account?denied=practice')
  if (role === 'doctor') {
    const doctor = await findDoctorByUserId(user.id)
    if (user.kyc_level !== 'verified' || !doctor || doctor.status !== 'ACTIVE' || (!doctor.verified_at && !(doctor.is_demo && localMode()))) {
      redirect('/account?denied=verification')
    }
    if(await getDb().one("SELECT c.id FROM clinic.clinics c JOIN provider.doctors d ON d.clinic_id=c.id WHERE d.id=$1 AND c.status<>'ACTIVE'",[doctor.id]))redirect('/account?denied=clinic')
  }
  return user
}

/* ---------------------------------------------------------- admin session */

/**
 * Admin sessions reuse the sessions table, keyed to an admin row rather than
 * a patient. The cookie holds an opaque token — never the passcode itself.
 */
export async function startAdminSession(adminId: string) {
  const token = newToken()
  await createAdminSession(token, adminId)
  const jar = await cookies()
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production' && !localMode(),
    path: '/',
    maxAge: 60 * 60 * 8,
  })
}

export async function endAdminSession() {
  const jar = await cookies()
  const token = jar.get(ADMIN_COOKIE)?.value
  if (token) await deleteAdminSession(token)
  jar.delete(ADMIN_COOKIE)
}

export async function currentAdmin(): Promise<{ id: string; username: string } | null> {
  const jar = await cookies()
  const token = jar.get(ADMIN_COOKIE)?.value
  if (!token) return null

  const session = await findAdminSession(token)
  if (!session) return null
  if (new Date(session.expires_at).getTime() < Date.now() || Date.now()-new Date(session.last_seen_at).getTime()>30*60000) {
    await deleteAdminSession(token)
    return null
  }

  await getDb().query("UPDATE admin_sessions SET last_seen_at=now() WHERE token=$1 AND last_seen_at<now()-interval '1 minute'",[tokenHash(token)])
  return await findAdminById(session.admin_id) ?? null
}

export { findAdmin }
