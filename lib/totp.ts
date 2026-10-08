import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto'
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export function newTotpSecret() {
  let bits=0,value=0,result=''
  for(const byte of randomBytes(20)) { value=(value<<8)|byte; bits+=8; while(bits>=5) { result+=alphabet[(value>>>(bits-5))&31]; bits-=5 } }
  if(bits) result+=alphabet[(value<<(5-bits))&31]
  return result
}
function decode(secret:string) {
  let bits=0,value=0;const bytes:number[]=[]
  for(const char of secret.toUpperCase().replace(/=+$/,'')) { const n=alphabet.indexOf(char); if(n<0) throw new Error('Invalid TOTP secret'); value=(value<<5)|n;bits+=5; if(bits>=8) {bytes.push((value>>>(bits-8))&255);bits-=8} }
  return Buffer.from(bytes)
}
export function totpAt(secret:string, step:number) {
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step))
  const mac=createHmac('sha1',decode(secret)).update(counter).digest(),offset=mac[mac.length-1]&15
  return String((mac.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')
}
export function verifyTotp(secret:string, code:string, now=Date.now()) {
  if(!/^\d{6}$/.test(code)) return null
  const current=Math.floor(now/30000)
  for(const step of [current,current-1,current+1]) if(timingSafeEqual(Buffer.from(totpAt(secret,step)),Buffer.from(code))) return step
  return null
}
