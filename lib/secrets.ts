import { createHash, randomBytes, createHmac, createCipheriv, createDecipheriv } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
export function localMode() { return process.env.CARENEST_LOCAL_MODE === '1' }
export function applicationSecret() {
  const configured = process.env.AUTH_SECRET ?? process.env.JWT_SECRET
  if (configured) {
    if (configured.length < 32) throw new Error('AUTH_SECRET must contain at least 32 characters')
    return configured
  }
  if (process.env.NODE_ENV === 'production' && !localMode()) throw new Error('AUTH_SECRET is required outside local mode')
  const directory = path.join(process.cwd(), '.data', 'secrets')
  mkdirSync(directory, { recursive: true })
  const filename = path.join(directory, 'auth.key')
  try { writeFileSync(filename, randomBytes(48).toString('hex'), { flag: 'wx', mode: 0o600 }) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  return readFileSync(filename, 'utf8').trim()
}
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
export const privateKey = (purpose: string, value: string) => createHmac('sha256', applicationSecret()).update(purpose + '\0' + value).digest('hex')
function storageKey() {
  const configured=process.env.DATA_ENCRYPTION_KEY
  if(configured){if(!/^[a-fA-F0-9]{64}$/.test(configured))throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes encoded as hex');return Buffer.from(configured,'hex')}
  if(process.env.NODE_ENV==='production'&&!localMode())throw new Error('DATA_ENCRYPTION_KEY is required outside local mode')
  const directory=path.join(process.cwd(),'.data','secrets');mkdirSync(directory,{recursive:true});const filename=path.join(directory,'storage.key')
  try{writeFileSync(filename,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600})}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error}
  return Buffer.from(readFileSync(filename,'utf8').trim(),'hex')
}
export function encryptSecret(value: string, context: string) {
  const active=process.env.DATA_ENCRYPTION_ACTIVE_ID
  const key=active?ringKey(active):storageKey(), iv=randomBytes(12)
  const cipher=createCipheriv('aes-256-gcm',key,iv)
  cipher.setAAD(Buffer.from(context))
  const bytes=Buffer.concat([cipher.update(value,'utf8'),cipher.final()])
  return [...(active?['v3',active]:['v2']),iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),bytes.toString('base64url')].join(':')
}
function ringKey(id:string){if(!/^[A-Za-z0-9_-]{1,64}$/.test(id))throw new Error('Invalid encryption key identifier');const ring=JSON.parse(process.env.DATA_ENCRYPTION_KEYRING??'{}') as Record<string,string>;const value=ring[id];if(typeof value!=='string'||!/^[a-fA-F0-9]{64}$/.test(value))throw new Error('Required encryption key is unavailable');return Buffer.from(value,'hex')}
export function decryptSecret(value: string, context: string) {
  const parts=value.split(':'),version=parts.shift(),id=version==='v3'?parts.shift():null,[iv,tag,body]=parts
  if(!['v1','v2','v3'].includes(version??'')||parts.length!==3||!iv||!tag||!body) throw new Error('Invalid encrypted envelope')
  const key=version==='v3'?ringKey(id??''):version==='v2'?storageKey():Buffer.from(privateKey('envelope-key','v1'),'hex')
  const cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'))
  cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(Buffer.from(tag,'base64url'))
  return Buffer.concat([cipher.update(Buffer.from(body,'base64url')),cipher.final()]).toString('utf8')
}
