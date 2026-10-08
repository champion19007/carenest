import 'server-only'
import { randomUUID } from 'node:crypto'
import { getDb,ensureSchema } from '@/lib/db/client'
import { boundedText,reject } from './errors'
export async function createAttendedReview(actorId:string,doctorId:string,rating:number,comment:string) {
  if(!Number.isInteger(rating)||rating<1||rating>5) reject('VALIDATION','Choose a rating from 1 to 5.',400)
  boundedText(comment,1000,10)
  await ensureSchema()
  return getDb().transaction(async tx=>{
    const d=await tx.one<{slug:string}>('SELECT slug FROM provider.doctors WHERE id=$1 FOR UPDATE',[doctorId])
    if(!d) reject('NOT_FOUND','That provider is unavailable.',404)
    const user=await tx.one<{name:string;status:string}>('SELECT name,status FROM patient.users WHERE id=$1',[actorId])
    if(user?.status!=='ACTIVE') reject('FORBIDDEN','Please sign in again.',403)
    if(!await tx.one("SELECT id FROM patient.bookings WHERE user_id=$1 AND doctor_id=$2 AND status='attended' AND attended_at IS NOT NULL",[actorId,doctorId])) reject('ELIGIBILITY','Reviews are available after the clinic records an attended appointment.',403)
    const body={doctorId:d.slug,userId:actorId,authorName:user.name||'Patient',rating,comment:comment.trim()}
    const inserted=await tx.one(`INSERT INTO documents(id,collection,subject_id,body) VALUES($1,'reviews',$2,$3::jsonb) ON CONFLICT DO NOTHING RETURNING id`,['rev_'+randomUUID(),d.slug,JSON.stringify(body)])
    if(!inserted) reject('DUPLICATE','You already reviewed this provider.')
    await tx.query(`UPDATE provider.doctors SET rating=(SELECT round(avg((body->>'rating')::numeric),1) FROM documents WHERE collection='reviews' AND subject_id=$2),
      reviews_count=(SELECT count(*) FROM documents WHERE collection='reviews' AND subject_id=$2) WHERE id=$1`,[doctorId,d.slug])
    await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'review:create',$2)",[actorId,inserted.id])
    return inserted.id
  })
}
