import 'server-only'
import {randomUUID} from 'node:crypto'
import {getDb,ensureSchema} from '@/lib/db/client'
import {boundedText,reject} from './errors'
export async function updatePersonProfile(actorId:string,input:{name:string;email:string|null;dob:string|null;gender:string|null;city:string|null}){
 boundedText(input.name,80,2);if(input.email)boundedText(input.email,254,3)
 if(input.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))reject('EMAIL','Enter a valid email address.',400)
 if(input.gender&&!['Male','Female','Other','Prefer not to say'].includes(input.gender))reject('GENDER','Choose an available gender option.',400)
 if(input.city)boundedText(input.city,80)
 if(input.dob&&(!/^\d{4}-\d{2}-\d{2}$/.test(input.dob)||Number.isNaN(new Date(input.dob).getTime())||new Date(input.dob).toISOString().slice(0,10)!==input.dob))reject('DATE','Check your birth date.',400)
 await ensureSchema();await getDb().transaction(async tx=>{
  if(input.dob){const valid=await tx.one<{valid:boolean}>("SELECT $1::date>(date '1900-01-01') AND $1::date<=(now() AT TIME ZONE 'Asia/Kolkata')::date valid",[input.dob]);if(!valid?.valid)reject('DATE','Check your birth date.',400)}
  const user=await tx.one<{phone:string|null}>('SELECT phone FROM patient.users WHERE id=$1 AND status=\'ACTIVE\' FOR UPDATE',[actorId]);if(!user)reject('FORBIDDEN','Sign in required.',403)
  if(!user.phone&&!input.email)reject('CONTACT','An email-only account must keep a contact email.',400)
  await tx.query(`UPDATE patient.users SET name=$2,email_verified_at=CASE WHEN lower(email)=lower($3::text) THEN email_verified_at ELSE NULL END,email=$3,dob=$4,gender=$5,city=$6 WHERE id=$1`,[actorId,input.name,input.email,input.dob,input.gender,input.city])
  await tx.query(`INSERT INTO patient.family_members(id,user_id,name,relation,is_self,dob,gender) VALUES($1,$2,$3,'Self',true,$4,$5)
   ON CONFLICT(user_id) WHERE is_self DO UPDATE SET name=$3,dob=$4,gender=$5`,['family_'+randomUUID(),actorId,input.name,input.dob,input.gender])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'profile:update',$1)",[actorId])
 })
}
