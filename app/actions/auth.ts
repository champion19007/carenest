'use server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createUser, findUserById, findUserByPhone, findAdmin, touchLogin, touchAdminLogin, setUserName, clearOtp } from '@/lib/db/sql'
import { getDb, ensureSchema } from '@/lib/db/client'
import { logActivity } from '@/lib/db/docs'
import { ensureSelfMember, renameSelfMember } from '@/lib/db/family'
import { currentUser, endAdminSession, endSession, newId, newOtp, startAdminSession, startSession, verifyPassword } from '@/lib/auth'
import { sendOtpSms, smsProviderName } from '@/lib/sms'
import { destinationFor, destinationForUser } from '@/lib/routes'
import { consumeOtp, issueOtp, normalizePhone } from '@/lib/domain/otp'
import { consumeLimits } from '@/lib/domain/rate-limit'
import { decryptSecret } from '@/lib/secrets'
import { verifyTotp } from '@/lib/totp'
export type ActionState = { error?: string; notice?: string; otpHint?: string; phone?: string }
async function clientIp() {
  const h=await headers()
  if(process.env.TRUST_PROXY!=='1') return 'untrusted-network'
  return h.get('x-forwarded-for')?.split(',').at(-1)?.trim().slice(0,80) || 'unknown'
}
export async function requestOtp(_prev:ActionState, form:FormData):Promise<ActionState> {
  const phone=normalizePhone(String(form.get('phone')??''))
  if(!phone) return {error:'Enter a valid Indian mobile number.'}
  const provider=smsProviderName()
  if(provider==='disabled') return {error:'Sign-in messages are not configured. Contact the operator.'}
  const result=await consumeLimits([
    {bucket:'otp-cooldown',key:phone,limit:1,seconds:60},
    {bucket:'otp-phone-short',key:phone,limit:3,seconds:900},
    {bucket:'otp-phone-hour',key:phone,limit:5,seconds:3600},
    {bucket:'otp-phone-day',key:phone,limit:10,seconds:86400},
    {bucket:'otp-network',key:await clientIp(),limit:20,seconds:3600},
  ])
  if(!result.allowed) return {error:`Please wait ${result.retryAfterSeconds} seconds before requesting another code.`}
  const code=newOtp()
  await issueOtp(phone,code)
  const delivery=await sendOtpSms(phone,code)
  if(provider!=='console' && !delivery.deliveredToDevice) {
    await clearOtp(phone)
    await logActivity({kind:'sms.failed',message:'OTP gateway request failed'})
    return {error:'We could not send the code. Please try again later.'}
  }
  return {phone,otpHint:provider==='console'?code:undefined,
    notice:provider==='console'?'Local demonstration code; no SMS was sent.':'Code requested. Check your messages.'}
}
export async function verifyOtp(_prev:ActionState, form:FormData):Promise<ActionState> {
  const phone=normalizePhone(String(form.get('phone')??'')),code=String(form.get('code')??'').trim()
  const name=String(form.get('name')??'').trim(),next=String(form.get('next')??'')
  if(!phone || !/^\d{6}$/.test(code) || name.length>80) return {error:'Check your phone number, code and name.'}
  const limit=await consumeLimits([{bucket:'otp-verification-network',key:await clientIp(),limit:30,seconds:900}])
  if(!limit.allowed) return {phone,error:'Too many attempts. Please try again later.'}
  const checked=await consumeOtp(phone,code)
  if(!checked.ok) return {phone,error:checked.reason==='attempts'?'Too many incorrect attempts. Request a new code.':checked.reason==='expired'?'That code expired. Request a new one.':'That code is incorrect.'}
  let user=await findUserByPhone(phone)
  if(!user) user=await createUser({id:newId('usr'),phone,name})
  else if(name && !user.name) { await setUserName(user.id,name);user=await findUserById(user.id)??user }
  if(user.status!=='ACTIVE') return {error:'This account cannot sign in.'}
  await touchLogin(user.id);await startSession(user)
  if(user.name) await ensureSelfMember(user.id,user.name,newId('fam'))
  await logActivity({kind:'user.login',message:'Account signed in',userId:user.id})
  redirect(destinationForUser(user,next))
}
export async function completeProfile(_prev:ActionState,form:FormData):Promise<ActionState> {
  const user=await currentUser()
  if(!user) return {error:'Please sign in again.'}
  const name=String(form.get('name')??'').trim().replace(/\s+/g,' ')
  if(name.length<2||name.length>80) return {error:'Enter a name between 2 and 80 characters.'}
  await setUserName(user.id,name);await ensureSelfMember(user.id,name,newId('fam'));await renameSelfMember(user.id,name)
  redirect(destinationFor(user.role,String(form.get('next')??'')))
}
export async function signOut() { await endSession();redirect('/') }
export async function adminLogin(_prev:ActionState,form:FormData):Promise<ActionState> {
  const username=String(form.get('username')??'').trim(),password=String(form.get('password')??''),code=String(form.get('totp')??'').trim()
  if(username.length>80||password.length>256) return {error:'Invalid credentials.'}
  const limit=await consumeLimits([{bucket:'admin-login',key:username,limit:5,seconds:900},{bucket:'admin-login-network',key:await clientIp(),limit:30,seconds:900}])
  if(!limit.allowed) return {error:'Too many attempts. Please try again later.'}
  const admin=await findAdmin(username)
  const correct=admin?await verifyPassword(password,admin.salt,admin.password_hash):await verifyPassword(password,'decoy','00')
  if(!admin||!correct||!admin.totp_secret) return {error:'Invalid credentials or authenticator code. Administrator provisioning is a local command.'}
  let step:number|null=null
  try {step=verifyTotp(decryptSecret(admin.totp_secret,'admin:'+username),code)} catch {}
  if(step===null) return {error:'Invalid credentials or authenticator code.'}
  await ensureSchema()
  const row=await getDb().one('UPDATE admins SET last_totp_step=$2 WHERE id=$1 AND (last_totp_step IS NULL OR last_totp_step<$2) RETURNING id',[admin.id,String(step)])
  if(!row) return {error:'That authenticator code was already used. Wait for the next code.'}
  await touchAdminLogin(admin.id);await startAdminSession(admin.id)
  await logActivity({kind:'admin.login',message:'Administrator authenticated with MFA',userId:admin.id})
  redirect('/admin')
}
export async function adminLogout() {await endAdminSession();redirect('/admin')}
