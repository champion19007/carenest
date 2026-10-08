import 'server-only'
import {randomUUID} from 'node:crypto'
import {getDb,ensureSchema} from '@/lib/db/client'
import {encryptSecret,decryptSecret} from '@/lib/secrets'
import {boundedText,reject} from './errors'
export async function createSupportCase(actorId:string,subject:string,detail:string){boundedText(subject,120,5);boundedText(detail,2000,10);await ensureSchema();return getDb().transaction(async tx=>{if(!await tx.one("SELECT id FROM patient.users WHERE id=$1 AND status='ACTIVE'",[actorId]))reject('FORBIDDEN','Sign in required.',403);const id='support_'+randomUUID();await tx.query('INSERT INTO support_cases(id,user_id,subject,detail) VALUES($1,$2,$3,$4)',[id,actorId,subject,encryptSecret(detail,'support:'+id)]);await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'support:create',$2)",[actorId,id]);return id})}
export async function supportCases(actorId:string,admin=false){await ensureSchema();if(admin&&!await getDb().one('SELECT id FROM admins WHERE id=$1 AND totp_secret IS NOT NULL',[actorId]))reject('FORBIDDEN','Administrator required.',403);const rows=await getDb().query<{id:string;subject:string;detail:string;state:string;user_id:string}>(`SELECT id,subject,detail,state,user_id FROM support_cases WHERE ($2::boolean OR user_id=$1) ORDER BY created_at DESC LIMIT 100`,[actorId,admin]);await getDb().query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'support:read',$1)",[actorId]);return rows.map(r=>({...r,detail:decryptSecret(r.detail,'support:'+r.id)}))}
export async function updateSupportCase(adminId:string,id:string,expected:string,next:string){
 const transitions:Record<string,string[]>={OPEN:['IN_REVIEW'],IN_REVIEW:['RESOLVED'],RESOLVED:['IN_REVIEW']}
 if(!transitions[expected]?.includes(next))reject('STATE','Choose an available case transition.',400)
 await ensureSchema();await getDb().transaction(async tx=>{
  if(!await tx.one('SELECT id FROM admins WHERE id=$1 AND totp_secret IS NOT NULL',[adminId]))reject('FORBIDDEN','Administrator required.',403)
  const updated=await tx.one<{user_id:string}>('UPDATE support_cases SET state=$3 WHERE id=$1 AND state=$2 RETURNING user_id',[id,expected,next])
  if(!updated)reject('CHANGED','The case changed. Refresh before reviewing it.')
  await tx.query("INSERT INTO audit_log(actor_id,action,resource,detail) VALUES($1,'support:transition',$2,$3::jsonb)",[adminId,id,JSON.stringify({from:expected,to:next})])
  await tx.query("INSERT INTO domain_events(kind,subject_id,payload) VALUES('support.updated',$1,$2::jsonb)",[id,JSON.stringify({userId:updated.user_id})])
 })
}
