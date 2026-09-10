import 'server-only'

/**
 * SMS delivery.
 *
 * Three adapters, chosen by environment:
 *
 *   SMS_PROVIDER=msg91   → MSG91 (the usual choice for Indian OTP traffic)
 *   SMS_PROVIDER=twilio  → Twilio
 *   unset                → console adapter, for local development
 *
 * The console adapter is the only one that returns the code to the caller.
 * As soon as a real provider is configured, `deliveredToDevice` is true and
 * the OTP never leaves the server — see `app/actions/auth.ts`, which only
 * echoes the code when this says it was not delivered.
 */

export type SmsResult = {
  /** True when a real gateway accepted the message. */
  deliveredToDevice: boolean
  /** Provider-side id, when there is one. */
  id?: string
  error?: string
}

export function smsProviderName(): 'msg91' | 'twilio' | 'console' {
  const provider = process.env.SMS_PROVIDER?.toLowerCase()
  if (provider === 'msg91' && process.env.MSG91_AUTH_KEY) return 'msg91'
  if (provider === 'twilio' && process.env.TWILIO_ACCOUNT_SID) return 'twilio'
  return 'console'
}

/** True once a real gateway is wired up. */
export function smsIsLive() {
  return smsProviderName() !== 'console'
}

export async function sendOtpSms(phone: string, code: string): Promise<SmsResult> {
  switch (smsProviderName()) {
    case 'msg91':
      return sendViaMsg91(phone, code)
    case 'twilio':
      return sendViaTwilio(phone, code)
    default:
      return sendViaConsole(phone, code)
  }
}

/**
 * A plain transactional message — a booking confirmation, an estimate.
 *
 * Separate from sendOtpSms because MSG91 routes one-time codes through a
 * dedicated OTP endpoint with its own DLT template. A confirmation sent down
 * that path would be rejected, so the two cannot share an adapter even though
 * they look alike from here.
 *
 * Throws on failure rather than returning a result object. Its only caller is
 * the outbox drain, which needs a rejection to know the row should be retried
 * — a quietly returned `{ deliveredToDevice: false }` would be marked sent.
 */
export async function sendSms(phone: string, message: string): Promise<void> {
  const digits = phone.replace(/\D/g, '').slice(-10)
  if (digits.length !== 10) throw new Error(`unusable phone number: ${phone}`)

  const result = await sendTextMessage(digits, message)
  if (!result.deliveredToDevice && smsIsLive()) {
    throw new Error(result.error ?? 'delivery failed')
  }
}

async function sendTextMessage(phone: string, message: string): Promise<SmsResult> {
  switch (smsProviderName()) {
    case 'msg91':
      return sendTextViaMsg91(phone, message)
    case 'twilio':
      return sendTextViaTwilio(phone, message)
    default:
      console.info(`[sms:console] to +91${phone}: ${message}`)
      return { deliveredToDevice: false }
  }
}

/** MSG91's general SMS endpoint, not the OTP one. */
async function sendTextViaMsg91(phone: string, message: string): Promise<SmsResult> {
  const authKey = process.env.MSG91_AUTH_KEY!
  const senderId = process.env.MSG91_SENDER_ID

  try {
    const response = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: authKey },
      body: JSON.stringify({
        sender: senderId,
        short_url: '0',
        mobiles: `91${phone}`,
        message,
      }),
    })
    const body = (await response.json().catch(() => ({}))) as { type?: string; message?: string }
    if (!response.ok || body.type === 'error') {
      return { deliveredToDevice: false, error: body.message ?? `MSG91 responded ${response.status}` }
    }
    return { deliveredToDevice: true, id: body.message }
  } catch (error) {
    return { deliveredToDevice: false, error: (error as Error).message }
  }
}

async function sendTextViaTwilio(phone: string, message: string): Promise<SmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID!
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_FROM_NUMBER

  if (!token || !from) {
    return { deliveredToDevice: false, error: 'TWILIO_AUTH_TOKEN or TWILIO_FROM_NUMBER is not set' }
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: `+91${phone}`, From: from, Body: message }),
      },
    )
    const body = (await response.json().catch(() => ({}))) as { sid?: string; message?: string }
    if (!response.ok) {
      return { deliveredToDevice: false, error: body.message ?? `Twilio responded ${response.status}` }
    }
    return { deliveredToDevice: true, id: body.sid }
  } catch (error) {
    return { deliveredToDevice: false, error: (error as Error).message }
  }
}

/* --------------------------------------------------------------- adapters */

async function sendViaConsole(phone: string, code: string): Promise<SmsResult> {
  console.info(`[sms:console] OTP for +91${phone} is ${code} (no gateway configured)`)
  return { deliveredToDevice: false }
}

/**
 * MSG91 OTP endpoint. Requires an approved DLT template — Indian regulation
 * does not allow sending transactional SMS without one.
 */
async function sendViaMsg91(phone: string, code: string): Promise<SmsResult> {
  const authKey = process.env.MSG91_AUTH_KEY!
  const templateId = process.env.MSG91_TEMPLATE_ID
  const senderId = process.env.MSG91_SENDER_ID

  if (!templateId) {
    return { deliveredToDevice: false, error: 'MSG91_TEMPLATE_ID is not set' }
  }

  try {
    const response = await fetch('https://control.msg91.com/api/v5/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: authKey },
      body: JSON.stringify({
        template_id: templateId,
        sender: senderId,
        mobile: `91${phone}`,
        otp: code,
      }),
    })

    const body = (await response.json().catch(() => ({}))) as { type?: string; message?: string }

    if (!response.ok || body.type === 'error') {
      return { deliveredToDevice: false, error: body.message ?? `MSG91 responded ${response.status}` }
    }
    return { deliveredToDevice: true, id: body.message }
  } catch (error) {
    return { deliveredToDevice: false, error: (error as Error).message }
  }
}

async function sendViaTwilio(phone: string, code: string): Promise<SmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID!
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_FROM_NUMBER

  if (!token || !from) {
    return { deliveredToDevice: false, error: 'TWILIO_AUTH_TOKEN or TWILIO_FROM_NUMBER is not set' }
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: `+91${phone}`,
          From: from,
          Body: `${code} is your CareNest verification code. It expires in 10 minutes. Do not share it with anyone.`,
        }),
      },
    )

    const body = (await response.json().catch(() => ({}))) as { sid?: string; message?: string }

    if (!response.ok) {
      return { deliveredToDevice: false, error: body.message ?? `Twilio responded ${response.status}` }
    }
    return { deliveredToDevice: true, id: body.sid }
  } catch (error) {
    return { deliveredToDevice: false, error: (error as Error).message }
  }
}
