import {loadEnvConfig} from '@next/env'
import {randomBytes,scrypt as scryptCallback,randomUUID} from 'node:crypto'
import {promisify} from 'node:util'
import {mkdir,writeFile,unlink} from 'node:fs/promises'
import {createDatabase} from '../lib/db/adapters'
import {applyMigrations} from '../lib/db/migrations'
import {encryptSecret} from '../lib/secrets'
import {newTotpSecret} from '../lib/totp'
import {assertLocalStopped} from './local-lock.mjs'
loadEnvConfig(process.cwd());process.env.CARENEST_LOCAL_MODE='1'
async function main(){
 await assertLocalStopped()
 const db=await createDatabase()
 try{
  await applyMigrations(db)
  const username=process.argv.find(v=>v.startsWith('--username='))?.slice(11)??'local-admin'
  if(!/^[a-zA-Z0-9_.-]{3,80}$/.test(username))throw new Error('Username must be 3–80 safe characters')
  if(await db.one('SELECT id FROM admins WHERE username=$1',[username])){console.log('Administrator already exists; existing credentials retained.');return}
  const password=process.env.CARENEST_ADMIN_PASSWORD??randomBytes(18).toString('base64url')
  if(password.length<14||password.length>256)throw new Error('Use a password with at least 14 characters')
  const salt=randomBytes(16).toString('hex'),hash=(await promisify(scryptCallback)(password,salt,64) as Buffer).toString('hex'),secret=newTotpSecret()
  const directory='.data/secrets';await mkdir(directory,{recursive:true})
  const setup=`LOCAL ADMIN SETUP — keep private, remove after enrollment\nUsername: ${username}\nInitial password: ${password}\nAuthenticator secret: ${secret}\notpauth://totp/CareNest:${encodeURIComponent(username)}?secret=${secret}&issuer=CareNest&algorithm=SHA1&digits=6&period=30\nPublic sign-in cannot create administrators. No cloud is used.\n`
  const filename=directory+'/admin-'+username+'-setup.txt'
  // Write setup material before committing; do not leave an unreachable provisioned account.
  await writeFile(filename,setup,{flag:'wx',mode:0o600})
  try{await db.transaction(async tx=>{
   await tx.query('INSERT INTO admins(id,username,password_hash,salt,totp_secret) VALUES($1,$2,$3,$4,$5)',['adm_'+randomUUID(),username,hash,salt,encryptSecret(secret,'admin:'+username)])
   await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'admin:provision',$1)",[username])
  })}catch(error){await unlink(filename).catch(()=>{});throw error}
  console.log(`Administrator provisioned. Private enrollment instructions saved in ${filename}; no password or secret printed.`)
 }finally{await db.close?.()}
}
main().catch(error=>{console.error('Local administrator provisioning failed:',(error as Error).message);process.exitCode=1})
