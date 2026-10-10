import 'server-only'
import {randomUUID} from 'node:crypto'
import {ensureSchema,getDb} from '@/lib/db/client'
import type {User} from '@/lib/db/sql'
import type {GoogleIdentity} from '@/lib/google'
import {reject} from './errors'

export async function acceptGoogleIdentity(identity:GoogleIdentity,linkUserId?:string){
 if(!identity.emailVerified||!identity.sub||identity.sub.length>255||!/^\S+@\S+\.\S+$/.test(identity.email)||identity.email.length>254)reject('GOOGLE_IDENTITY','Google must verify the account email.',400)
 await ensureSchema()
 return getDb().transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['google:'+identity.sub])
  const existing=await tx.one<User>('SELECT * FROM patient.users WHERE google_sub=$1 FOR UPDATE',[identity.sub])
  const actor=linkUserId?await tx.one<User>('SELECT * FROM patient.users WHERE id=$1 FOR UPDATE',[linkUserId]):undefined
  if(linkUserId&&(!actor||actor.status!=='ACTIVE'))reject('GOOGLE_LINK','Sign into the account you want to connect first.',403)
  if(existing&&existing.status!=='ACTIVE')reject('GOOGLE_ACCOUNT','This account cannot sign in.',403)
  if(actor&&(existing&&existing.id!==actor.id||actor.google_sub&&actor.google_sub!==identity.sub))reject('GOOGLE_LINK','This Google identity is already connected to a different account.',409)
  const emailOwner=await tx.one<User>('SELECT * FROM patient.users WHERE lower(email)=lower($1) AND email_verified_at IS NOT NULL',[identity.email])
  const user=actor??existing
  if(emailOwner&&emailOwner.id!==user?.id)reject('GOOGLE_LINK','Sign into the existing account before linking Google. Accounts are not merged automatically.',409)
  let result:User
  if(user){
   result=(await tx.one<User>('UPDATE patient.users SET google_sub=$2,email=$3,email_verified_at=now() WHERE id=$1 RETURNING *',[user.id,identity.sub,identity.email]))!
  }else{
   result=(await tx.one<User>("INSERT INTO patient.users(id,email,google_sub,name,email_verified_at) VALUES($1,$2,$3,$4,now()) RETURNING *",['usr_'+randomUUID(),identity.email,identity.sub,identity.name.slice(0,80)]))!
  }
  await tx.query('INSERT INTO audit_log(actor_id,action,resource) VALUES($1,$2,$1)',[result.id,actor?'identity:google_linked':'identity:google_authenticated'])
  return {user:result,isNew:!user}
 })
}
