import 'server-only'
import {randomUUID,randomBytes} from 'node:crypto'
import {encryptSecret,privateKey} from '@/lib/secrets'
import {istDate,istMinutes} from '@/lib/practice-calendar'
import type {Db} from '@/lib/db/client'
import {boundedText,reject} from './errors'
import {workspaceTransaction,workspaceKey,requestDigest,workspaceAudit,type WorkspaceDoctor} from './workspace-access'
import {createClinicPerson,clinicPerson} from './workspace-patients'
import {workspaceWindowFree,onlineWindowFree} from './workspace-conflicts'
export function visitWindow(rawStart:string,duration:number){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(rawStart)||Number.isNaN(Date.parse(rawStart))||![15,30,45,60].includes(duration))reject('TIME','Choose a valid appointment time and 15, 30, 45 or 60 minutes.',400)
 const start=new Date(rawStart).toISOString(),end=new Date(Date.parse(start)+duration*60000).toISOString()
 if(istMinutes(start)%15!==0||new Date(start).getUTCSeconds()!==0||new Date(start).getUTCMilliseconds()!==0||istDate(start)!==istDate(new Date(Date.parse(end)-1)))reject('TIME','Appointments must begin on a quarter hour and stay within one clinic day.',400)
 return {start,end,duration}
}
async function validateVisitWindow(tx:Db,d:WorkspaceDoctor,start:string,end:string,exclude:string|null=null){
 const time=await tx.one<{valid:boolean}>('SELECT $1::timestamptz>clock_timestamp() AND $2::timestamptz<=clock_timestamp()+interval \'90 days\' valid',[start,end]);if(!time?.valid)reject('TIME','Schedule a future appointment within the next 90 days.',400)
 const day=istDate(start),weekday=new Date(day+'T00:00:00Z').getUTCDay(),minute=istMinutes(start),duration=(Date.parse(end)-Date.parse(start))/60000
 if(!await tx.one('SELECT id FROM provider.schedule_rules WHERE doctor_id=$1 AND weekday=$2 AND enabled AND start_minute<=$3 AND end_minute>=$4',[d.id,weekday,minute,minute+duration]))reject('HOURS','This time is outside your published clinic hours. Update clinic hours first.',409)
 if(await tx.one('SELECT day FROM provider.schedule_exceptions WHERE doctor_id=$1 AND day=$2::date AND closed=true',[d.id,day]))reject('CLOSED','The clinic is closed on this date.',409)
 await workspaceWindowFree(tx,d.id,start,end,exclude);await onlineWindowFree(tx,d.id,start,end)
}
async function reminder(tx:Db,d:WorkspaceDoctor,id:string,revision:number,start:string){await tx.query(`INSERT INTO domain_events(kind,subject_id,payload,event_key,available_at) VALUES('practice.visit_reminder',$1,$2::jsonb,$3,greatest(now(),$4::timestamptz-interval '10 minutes')) ON CONFLICT DO NOTHING`,[id,JSON.stringify({userId:d.user_id,revision}),`practice-visit:${id}:${revision}:reminder`,start])}
async function recordArrival(tx:Db,d:WorkspaceDoctor,actorId:string,personId:string,fee:string,key:string,hash:string){
 const person=await clinicPerson(tx,d,actorId,personId),prior=await tx.one<{id:string;request_hash:string;doctor_id:string;created_by:string}>('SELECT id,request_hash,doctor_id,created_by FROM clinic.walk_ins WHERE clinic_id=$1 AND request_key=$2',[d.clinic_id,key]);if(prior){if(prior.request_hash!==hash||prior.doctor_id!==d.id||prior.created_by!==actorId)reject('IDEMPOTENCY','This arrival request contains different visit details.');return {id:prior.id,claimToken:null}}
 const id='walk_'+randomUUID();await tx.query('INSERT INTO clinic.walk_ins(id,clinic_id,person_id,doctor_id,fee_paise,request_key,request_hash,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,d.clinic_id,personId,d.id,fee,key,hash,actorId])
 await tx.query('INSERT INTO clinic.encounters(id,walk_in_id,doctor_id,clinic_person_id,patient_user_id) VALUES($1,$2,$3,$4,$5)',['enc_'+randomUUID(),id,d.id,personId,person.owner_id])
 await tx.query('INSERT INTO clinic.invoices(id,walk_in_id,clinic_person_id,total_paise,user_id) VALUES($1,$2,$3,$4,$5)',['inv_'+randomUUID(),id,personId,fee,person.owner_id])
 let claimToken:string|null=null;if(!person.owner_id&&!person.claim_live){claimToken=randomBytes(32).toString('base64url');await tx.query("UPDATE clinic.people SET claim_hash=$2,claim_expires_at=now()+interval '7 days' WHERE id=$1",[personId,privateKey('clinic-claim',claimToken)])}
 await workspaceAudit(tx,actorId,'practice:arrival-recorded',id);return {id,claimToken}
}
export async function checkInClinicPatient(actorId:string,personId:string,rawKey:unknown){const key=workspaceKey(rawKey);return workspaceTransaction(actorId,async(tx,d)=>{if(!Number.isInteger(Number(d.fee))||Number(d.fee)<0||Number(d.fee)>1000000)reject('FEE','Correct the practitioner fee first.',400);return recordArrival(tx,d,actorId,personId,String(BigInt(d.fee)*100n),key,requestDigest([d.id,personId,key]))},true)}
export async function scheduleClinicVisit(actorId:string,input:{personId?:string;patient?:Record<string,unknown>;startsAt:string;duration:number;reason:string;procedures:string;requestKey:string}){
 const key=workspaceKey(input.requestKey),window=visitWindow(input.startsAt,input.duration),details={reason:boundedText(input.reason,2000),procedures:boundedText(input.procedures,2000)}
 return workspaceTransaction(actorId,async(tx,d)=>{
  const hash=requestDigest([input.personId??null,input.patient??null,window,details]),existing=await tx.one<{id:string;request_hash:string}>('SELECT id,request_hash FROM clinic.scheduled_visits WHERE doctor_id=$1 AND request_key=$2',[d.id,key])
  if(existing){if(existing.request_hash!==hash)reject('IDEMPOTENCY','This appointment request contains different details. Refresh the form.');return existing.id}
  await validateVisitWindow(tx,d,window.start,window.end)
  const personId=input.personId||await createClinicPerson(tx,d,actorId,input.patient??{},key);await clinicPerson(tx,d,actorId,personId)
  if(!Number.isInteger(Number(d.fee))||Number(d.fee)<0||Number(d.fee)>1000000)reject('FEE','Correct the practitioner fee before scheduling.',400)
  const id='visit_'+randomUUID();await tx.query('INSERT INTO clinic.scheduled_visits(id,doctor_id,clinic_id,person_id,starts_at,ends_at,fee_paise,encrypted_details,created_by,request_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,d.id,d.clinic_id,personId,window.start,window.end,String(BigInt(d.fee)*100n),encryptSecret(JSON.stringify(details),'visit:'+id),actorId,key,hash])
  await tx.query("INSERT INTO clinic.visit_history(id,visit_id,actor_id,to_state,revision) VALUES($1,$2,$3,'SCHEDULED',0)",['vh_'+randomUUID(),id,actorId]);await reminder(tx,d,id,0,window.start);await workspaceAudit(tx,actorId,'practice:visit-scheduled',id);return id
 },true)
}
export async function rescheduleClinicVisit(actorId:string,id:string,revision:number,startsAt:string,duration:number){const window=visitWindow(startsAt,duration);return workspaceTransaction(actorId,async(tx,d)=>{
 const v=await tx.one<{id:string;person_id:string;state:string;revision:number}>('SELECT * FROM clinic.scheduled_visits WHERE id=$1 AND doctor_id=$2 FOR UPDATE',[id,d.id]);if(!v||v.state!=='SCHEDULED'||v.revision!==revision)reject('STATE','This appointment changed or can no longer be rescheduled.',409)
 await clinicPerson(tx,d,actorId,v.person_id);await validateVisitWindow(tx,d,window.start,window.end,id)
 await tx.query('UPDATE clinic.scheduled_visits SET starts_at=$2,ends_at=$3,revision=revision+1 WHERE id=$1',[id,window.start,window.end]);await tx.query("INSERT INTO clinic.visit_history(id,visit_id,actor_id,from_state,to_state,revision) VALUES($1,$2,$3,'SCHEDULED','SCHEDULED',$4)",['vh_'+randomUUID(),id,actorId,revision+1]);await reminder(tx,d,id,revision+1,window.start);await workspaceAudit(tx,actorId,'practice:visit-rescheduled',id)
},true)}
export async function changeClinicVisit(actorId:string,id:string,revision:number,next:'ARRIVED'|'CANCELLED'|'NO_SHOW'){return workspaceTransaction(actorId,async(tx,d)=>{
 const v=await tx.one<{person_id:string;state:string;revision:number;fee_paise:string;starts_at:string;ends_at:string}>('SELECT * FROM clinic.scheduled_visits WHERE id=$1 AND doctor_id=$2 FOR UPDATE',[id,d.id]);if(!v||v.state!=='SCHEDULED'||v.revision!==revision||!['ARRIVED','CANCELLED','NO_SHOW'].includes(next))reject('STATE','This appointment changed. Refresh the calendar.',409)
 if(next!=='CANCELLED'){const window=await tx.one<{allowed:boolean}>('SELECT CASE WHEN $2::text=\'NO_SHOW\' THEN clock_timestamp()>=$3::timestamptz ELSE clock_timestamp() BETWEEN $1::timestamptz-interval \'60 minutes\' AND $3::timestamptz+interval \'60 minutes\' END allowed',[v.starts_at,next,v.ends_at]);if(!window?.allowed)reject('TIME','Record arrival near the appointment time, or a no-show after it ends.',409)}
 let walkId:string|null=null,claimToken:string|null=null
 if(next==='ARRIVED'){
  const arrival=await recordArrival(tx,d,actorId,v.person_id,v.fee_paise,'scheduled-'+id,requestDigest([id,revision]));walkId=arrival.id;claimToken=arrival.claimToken
 }
 await tx.query('UPDATE clinic.scheduled_visits SET state=$2,walk_in_id=$3,revision=revision+1 WHERE id=$1',[id,next,walkId]);await tx.query('INSERT INTO clinic.visit_history(id,visit_id,actor_id,from_state,to_state,revision) VALUES($1,$2,$3,$4,$5,$6)',['vh_'+randomUUID(),id,actorId,v.state,next,revision+1]);await workspaceAudit(tx,actorId,'practice:visit-'+next.toLowerCase(),id);return {id,claimToken}
},true)}

export async function reissueClinicClaim(actorId:string,personId:string,attested:boolean){if(!attested)reject('CONSENT','Confirm you checked the patient or guardian identity in person.',400);return workspaceTransaction(actorId,async(tx,d)=>{const person=await clinicPerson(tx,d,actorId,personId);if(person.owner_id)reject('CLAIM','This patient already has an account owner.',409);const claimToken=randomBytes(32).toString('base64url');await tx.query("UPDATE clinic.people SET claim_hash=$2,claim_expires_at=now()+interval '7 days' WHERE id=$1",[personId,privateKey('clinic-claim',claimToken)]);await workspaceAudit(tx,actorId,'practice:claim-reissued',personId);return {id:personId,claimToken}},true)}
