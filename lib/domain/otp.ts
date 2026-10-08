import 'server-only'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { ensureSchema, getDb } from '@/lib/db/client'
import { privateKey } from '@/lib/secrets'
export function normalizePhone(value: string) {
  let digits=value.replace(/\D/g,'')
  if(digits.length===12 && digits.startsWith('91')) digits=digits.slice(2)
  return /^[6-9]\d{9}$/.test(digits) ? digits : null
}
export async function issueOtp(phone: string, code: string) {
  await ensureSchema()
  const challenge=randomUUID()
  const mac=privateKey('otp',phone+':'+challenge+':'+code)
  await getDb().query(`INSERT INTO otps(phone,code,challenge_id,expires_at,attempts,sent_at)
    VALUES($1,$2,$3,now()+interval '5 minutes',0,now()) ON CONFLICT(phone) DO UPDATE
    SET code=$2,challenge_id=$3,expires_at=now()+interval '5 minutes',attempts=0,sent_at=now()`,[phone,mac,challenge])
  return challenge
}
export async function consumeOtp(phone: string, code: string) {
  await ensureSchema()
  return getDb().transaction(async tx=>{
    const r=await tx.one<{code:string;challenge_id:string;attempts:number;expired:boolean}>(
      'SELECT code,challenge_id,attempts,expires_at<=now() AS expired FROM otps WHERE phone=$1 FOR UPDATE',[phone])
    if(!r || r.expired || !r.challenge_id) return {ok:false,reason:'expired'}
    if(r.attempts>=5) return {ok:false,reason:'attempts'}
    const expected=Buffer.from(r.code,'hex'), supplied=Buffer.from(privateKey('otp',phone+':'+r.challenge_id+':'+code),'hex')
    const correct=/^\d{6}$/.test(code) && expected.length===supplied.length && timingSafeEqual(expected,supplied)
    if(!correct) {
      await tx.query('UPDATE otps SET attempts=attempts+1 WHERE phone=$1',[phone])
      return {ok:false,reason:r.attempts+1>=5?'attempts':'invalid'}
    }
    await tx.query('DELETE FROM otps WHERE phone=$1',[phone])
    return {ok:true,reason:''}
  })
}
