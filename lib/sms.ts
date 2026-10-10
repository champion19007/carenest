import 'server-only'
import {fast2smsReady,sendFast2sms} from './fast2sms'
import {DomainError} from './domain/errors'
import {twilioVerifyConfigured} from './twilio-verify'

/**
 * SMS delivery.
 *
 * Three adapters, chosen by environment:
 *
 *   SMS_PROVIDER=msg91   → MSG91 (the usual choice for Indian OTP traffic)
 *   SMS_PROVIDER=twilio  → Twilio Programmable Messaging
 *   SMS_PROVIDER=twilio-verify → Provider-generated code, handled by auth actions
 *   unset                → disabled
 *
 * The console adapter is the only one that returns the code to the caller.
 * Gateway acceptance does not prove handset delivery. Real sign-in codes are
 * never returned to the browser; Twilio Verify creates and checks its own.
 */

export type SmsResult = {
  /** True when a real gateway accepted the message. */
  deliveredToDevice: boolean
  /** Provider-side id, when there is one. */
  id?: string
  error?: string
}

export function smsProviderName(): 'twilio-verify' | 'fast2sms' | 'msg91' | 'twilio' | 'console' | 'disabled' {
  const provider = process.env.SMS_PROVIDER?.toLowerCase()
  if(provider==='twilio-verify')return twilioVerifyConfigured()?'twilio-verify':'disabled'
  if(provider==='fast2sms')return fast2smsReady('sms','OTP')?'fast2sms':'disabled'
  if (provider === 'msg91' && process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID) return 'msg91'
  if (provider === 'twilio' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) return 'twilio'
  if (provider === 'console' && process.env.CARENEST_LOCAL_MODE === '1' && process.env.ALLOW_LOCAL_OTP === '1') return 'console'
  return 'disabled'
}

/** True once a real gateway is wired up. */
export function smsIsLive() {
  return ['fast2sms','msg91','twilio'].includes(smsProviderName())
}

export function smsOtpSetupError(): string | null {
  if (smsProviderName() !== 'disabled') return null
  return 'SMS verification is not ready yet. No code was sent.'
}

export async function sendOtpSms(phone: string, code: string,challenge?:string): Promise<SmsResult> {
  switch (smsProviderName()) {
    case 'twilio-verify':
      return {deliveredToDevice:false,error:'Twilio Verify creates its own codes; use the Verify sign-in flow.'}
    case 'fast2sms':
      try{if(!challenge)throw new Error('Missing challenge');return {deliveredToDevice:true,id:await sendFast2sms(phone,'sms','OTP','otp:'+challenge,null,[code])}}catch(error){return {deliveredToDevice:false,error:error instanceof DomainError?error.message:'Fast2SMS did not accept the sign-in message.'}}
    case 'msg91':
      return sendViaMsg91(phone, code)
    case 'twilio':
      return sendViaTwilio(phone, code)
    case 'disabled':
      return { deliveredToDevice:false,error:'SMS is not configured' }
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
  if (!result.deliveredToDevice) {
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
      return { deliveredToDevice: false,error:'No live SMS provider configured' }
  }
}
export async function sendTransactionalSms(phone:string,message:string):Promise<string>{
  const digits=phone.replace(/\D/g,'').slice(-10)
  if(!/^[6-9]\d{9}$/.test(digits))throw new Error('Invalid notification contact')
  const result=await sendTextMessage(digits,message)
  if(!result.deliveredToDevice||!result.id)throw new Error('Notification gateway outcome was not accepted')
  return result.id
}

/** MSG91's general SMS endpoint, not the OTP one. */
async function sendTextViaMsg91(phone: string, message: string): Promise<SmsResult> {
  const authKey = process.env.MSG91_AUTH_KEY!
  const senderId = process.env.MSG91_SENDER_ID
  const flowId=process.env.MSG91_TRANSACTIONAL_FLOW_ID
  if(!flowId)return {deliveredToDevice:false,error:'MSG91_TRANSACTIONAL_FLOW_ID is required'}

  try {
    const response = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: authKey },
      body: JSON.stringify({
        flow_id:flowId,
        sender: senderId,
        short_url: '0',
        recipients:[{mobiles:`91${phone}`,message}],
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
          Body: `${code} is your CareNest verification code. It expires in 5 minutes. Do not share it with anyone.`,
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
