import type {Db} from './adapters'
import {randomUUID} from 'node:crypto'

/** Hide surplus fixtures without deleting appointments, receipts or clinical history. */
export async function consolidateDemoCatalogue(db:Db){
 return db.transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(19423708)')
  const extras=await tx.query<{id:string;status:string}>(`SELECT id,status FROM (
   SELECT id,status,row_number() OVER(PARTITION BY kind,lower(trim(speciality))
    ORDER BY CASE WHEN id IN ('ananya-deshmukh','neha-kulkarni') THEN 0 ELSE 1 END,
    (user_id IS NOT NULL) DESC,id) position
   FROM provider.doctors WHERE is_demo=true AND status='ACTIVE'
  ) ranked WHERE position>1`)
  for(const row of extras){
   await tx.query("INSERT INTO provider.demo_catalogue_archive(doctor_id,previous_status,reason) VALUES($1,$2,'One local demonstration profile per specialty') ON CONFLICT DO NOTHING",[row.id,row.status])
   await tx.query("UPDATE provider.doctors SET status='SUSPENDED' WHERE id=$1 AND is_demo=true",[row.id])
   await tx.query("INSERT INTO provider.status_history(id,doctor_id,from_status,to_status,reason,actor) VALUES($1,$2,$3,'SUSPENDED','Surplus demo archived; history retained','local-catalogue-maintenance')",['demo_archive_'+randomUUID(),row.id,row.status])
  }
  // A public video offer must have a real local test clinician able to host it.
  await tx.query("UPDATE provider.doctors SET video=false WHERE is_demo=true AND user_id IS NULL")
  const kept=await tx.query<{kind:string;speciality:string;count:string}>("SELECT kind,speciality,count(*) count FROM provider.doctors WHERE is_demo=true AND status='ACTIVE' GROUP BY kind,speciality ORDER BY kind,speciality")
  await tx.query("INSERT INTO audit_log(action,resource,detail) VALUES('demo:catalogue_consolidated','local-demo-catalogue',$1::jsonb)",[JSON.stringify({archived:extras.length,categories:kept.length})])
  return {archived:extras.length,kept}
 })
}
