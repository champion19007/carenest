import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
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

export async function startSession(userId: string) {
  const token = newToken()
  createSession(token, userId)
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export async function endSession() {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) deleteSession(token)
  jar.delete(SESSION_COOKIE)
}

/** The signed-in user, or null. Safe from any server component. */
export async function currentUser(): Promise<User | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = findSession(token)
  if (!session) return null

  if (new Date(session.expires_at).getTime() < Date.now()) {
    deleteSession(token)
    return null
  }

  return findUserById(session.user_id) ?? null
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
  if (user.role !== role) redirect('/account?denied=practice')
  return user
}

/* ---------------------------------------------------------- admin session */

/**
 * Admin sessions reuse the sessions table, keyed to an admin row rather than
 * a patient. The cookie holds an opaque token — never the passcode itself.
 */
export async function startAdminSession(adminId: string) {
  const token = newToken()
  createAdminSession(token, adminId)
  const jar = await cookies()
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8,
  })
}

export async function endAdminSession() {
  const jar = await cookies()
  const token = jar.get(ADMIN_COOKIE)?.value
  if (token) deleteAdminSession(token)
  jar.delete(ADMIN_COOKIE)
}

export async function currentAdmin(): Promise<{ id: string; username: string } | null> {
  const jar = await cookies()
  const token = jar.get(ADMIN_COOKIE)?.value
  if (!token) return null

  const session = findAdminSession(token)
  if (!session) return null
  if (new Date(session.expires_at).getTime() < Date.now()) {
    deleteAdminSession(token)
    return null
  }

  return findAdminById(session.admin_id) ?? null
}

export { findAdmin }
