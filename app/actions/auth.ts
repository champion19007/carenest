'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import {
  bumpOtpAttempts,
  clearOtp,
  createAdmin,
  createUser,
  countAdmins,
  findAdmin,
  findUserById,
  findUserByPhone,
  hitRateLimit,
  putOtp,
  setUserName,
  takeOtp,
  touchAdminLogin,
  touchLogin,
} from '@/lib/db/sql'
import { logActivity } from '@/lib/db/docs'
import {
  endAdminSession,
  endSession,
  hashPassword,
  newId,
  newOtp,
  startAdminSession,
  startSession,
  verifyPassword,
} from '@/lib/auth'
import { sendOtpSms, smsIsLive } from '@/lib/sms'

export type ActionState = { error?: string; notice?: string; otpHint?: string; phone?: string }

const PHONE = /^[6-9]\d{9}$/

/** Per-number and per-IP caps, so nobody can burn the SMS budget. */
const OTP_PER_PHONE = { limit: 5, windowMinutes: 60 }
const OTP_PER_IP = { limit: 20, windowMinutes: 60 }

async function clientIp() {
  const list = await headers()
  const forwarded = list.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || list.get('x-real-ip') || 'unknown'
}

/**
 * Step 1 of sign-in: issue a one-time code.
 *
 * The code is only echoed back to the browser when no SMS gateway is
 * configured. Once `SMS_PROVIDER` is set, it is sent over SMS and never
 * leaves the server.
 */
export async function requestOtp(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const phone = String(formData.get('phone') ?? '').replace(/\D/g, '')

  if (!PHONE.test(phone)) {
    return { error: 'Enter a valid 10-digit Indian mobile number.' }
  }

  const byPhone = await hitRateLimit('otp:phone', phone, OTP_PER_PHONE.limit, OTP_PER_PHONE.windowMinutes)
  if (!byPhone.allowed) {
    await logActivity({ kind: 'otp.rate_limited', message: `Rate limit hit for ${mask(phone)}` })
    return {
      error: `Too many codes requested for this number. Try again in ${Math.ceil(
        byPhone.retryAfterSeconds / 60,
      )} minutes.`,
    }
  }

  const ip = await clientIp()
  const byIp = await hitRateLimit('otp:ip', ip, OTP_PER_IP.limit, OTP_PER_IP.windowMinutes)
  if (!byIp.allowed) {
    await logActivity({ kind: 'otp.rate_limited', message: `Rate limit hit for IP ${ip}` })
    return { error: 'Too many requests from this network. Please try again later.' }
  }

  const code = newOtp()
  await putOtp(phone, code)

  const result = await sendOtpSms(phone, code)
  if (smsIsLive() && !result.deliveredToDevice) {
    await logActivity({
      kind: 'sms.failed',
      message: `SMS delivery failed for ${mask(phone)}: ${result.error ?? 'unknown error'}`,
    })
    return { error: 'We could not send the code right now. Please try again in a moment.' }
  }

  await logActivity({ kind: 'otp.requested', message: `OTP issued for ${mask(phone)}` })

  return {
    phone,
    /* Only surfaced in development, when there is no gateway to send it. */
    otpHint: result.deliveredToDevice ? undefined : code,
    notice: result.deliveredToDevice ? `Code sent to +91 ${phone}` : undefined,
  }
}

/** Step 2: verify the code, creating the account on first sign-in. */
export async function verifyOtp(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const phone = String(formData.get('phone') ?? '').replace(/\D/g, '')
  const code = String(formData.get('code') ?? '').replace(/\D/g, '')
  const name = String(formData.get('name') ?? '').trim()
  const next = String(formData.get('next') ?? '/dashboard/patient')

  const record = await takeOtp(phone)
  if (!record) return { phone, error: 'That code has expired. Request a new one.' }

  if (new Date(record.expires_at).getTime() < Date.now()) {
    await clearOtp(phone)
    return { phone, error: 'That code has expired. Request a new one.' }
  }

  if (record.attempts >= 5) {
    await clearOtp(phone)
    return { phone, error: 'Too many incorrect attempts. Request a new code.' }
  }

  if (record.code !== code) {
    await bumpOtpAttempts(phone)
    return { phone, error: 'That code is not correct. Please check and try again.' }
  }

  await clearOtp(phone)

  let user = await findUserByPhone(phone)
  const isNew = !user
  if (!user) {
    user = await createUser({ id: newId('usr'), phone, name })
    await logActivity({
      kind: 'user.created',
      message: `New patient account ${mask(phone)}`,
      userId: user.id,
    })
  } else if (name && !user.name) {
    await setUserName(user.id, name)
    user = await findUserById(user.id) ?? user
  }

  await touchLogin(user.id)
  await startSession(user)
  await logActivity({
    kind: isNew ? 'user.signup' : 'user.login',
    message: `${isNew ? 'Signed up' : 'Logged in'}: ${mask(phone)}`,
    userId: user.id,
  })

  redirect(next.startsWith('/') ? next : '/dashboard/patient')
}

export async function signOut() {
  await endSession()
  redirect('/')
}

/* ------------------------------------------------------------------ admin */

const ADMIN_LOGIN = { limit: 8, windowMinutes: 15 }

/**
 * Password login for the admin console. On a completely fresh database the
 * first submitted credentials create the sole admin account, so there is no
 * default password baked into the source.
 */
export async function adminLogin(
  _prev: { error?: string; notice?: string },
  formData: FormData,
): Promise<{ error?: string; notice?: string }> {
  const username = String(formData.get('username') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')

  if (username.length < 3 || password.length < 10) {
    return { error: 'Username must be 3+ characters and password 10+ characters.' }
  }

  const ip = await clientIp()
  const limit = await hitRateLimit('admin:login', ip, ADMIN_LOGIN.limit, ADMIN_LOGIN.windowMinutes)
  if (!limit.allowed) {
    await logActivity({ kind: 'admin.rate_limited', message: `Admin login throttled for ${ip}` })
    return { error: 'Too many attempts. Try again shortly.' }
  }

  /* Bootstrap: the very first login on an empty table becomes the admin. */
  if (await countAdmins() === 0) {
    const { salt, hash } = await hashPassword(password)
    const id = newId('adm')
    await createAdmin({ id, username, passwordHash: hash, salt })
    await startAdminSession(id)
    await logActivity({ kind: 'admin.created', message: `Admin account created: ${username}` })
    redirect('/admin')
  }

  const admin = await findAdmin(username)
  /* Run the hash even when the user is unknown, so a missing username and a
     wrong password take the same time. */
  const ok = admin
    ? await verifyPassword(password, admin.salt, admin.password_hash)
    : await verifyPassword(password, 'decoy', '00')

  if (!admin || !ok) {
    await logActivity({ kind: 'admin.denied', message: `Failed admin login for "${username}"` })
    return { error: 'Incorrect username or password.' }
  }

  await touchAdminLogin(admin.id)
  await startAdminSession(admin.id)
  await logActivity({ kind: 'admin.login', message: `Admin signed in: ${admin.username}` })
  redirect('/admin')
}

export async function adminLogout() {
  await endAdminSession()
  redirect('/admin')
}

/* ---------------------------------------------------------------- helpers */

/** Show only the last four digits in logs — never the full number. */
function mask(phone: string) {
  return `••••••${phone.slice(-4)}`
}
