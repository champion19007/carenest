import 'server-only'
import {randomUUID,createHash} from 'node:crypto'
import {ensureSchema,getDb} from '@/lib/db/client'
import {encryptSecret,decryptSecret} from '@/lib/secrets'
import {HOME_CARE_SERVICES,CARE_WINDOWS,type HomeCareService,type CareAudience} from '@/lib/home-care'
import {boundedText,reject} from './errors'
import {adminAccess} from './governance'
import {consumeLimits} from './rate-limit'

type Details={notes:string;reviewNote?:string}
export type HomeCareRequest={id:string;service_kind:HomeCareService;audience:CareAudience;city:string;pin_code:string|null;starts_on:string;ends_on:string|null;time_window:string;status:string;revision:number;details:Details;created_at:string;subject_name:string}
type Stored=Omit<HomeCareRequest,'details'>&{encrypted_details:string}
const decode=(row:Stored):HomeCareRequest=>({id:row.id,service_kind:row.service_kind,audience:row.audience,city:row.city,pin_code:row.pin_code,starts_on:row.starts_on,ends_on:row.ends_on,time_window:row.time_window,status:row.status,revision:row.revision,created_at:row.created_at,subject_name:row.subject_name,details:JSON.parse(decryptSecret(row.encrypted_details,'home-care:'+row.id))})
function date(value:unknown){const text=String(value??'');if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||Number.isNaN(Date.parse(text))||new Date(text).toISOString().slice(0,10)!==text)reject('DATE','Choose a valid care date.',400);return text}
export async function requestHomeCare(actorId:string,raw:Record<string,unknown>){
 const service=String(raw.service),audience=String(raw.audience),window=String(raw.timeWindow??'flexible'),key=boundedText(raw.requestKey,128,16)
 if(!HOME_CARE_SERVICES.includes(service as HomeCareService)||!['human','pet'].includes(audience)||!CARE_WINDOWS.includes(window as typeof CARE_WINDOWS[number]))reject('SERVICE','Choose a care service and who it is for.',400)
 if(raw.consent!==true)reject('CONSENT','Agree to share this request with the care coordination team.',400)
 const body={service,audience,city:boundedText(raw.city,100,2),pin:boundedText(raw.pin,6,6),startsOn:date(raw.startsOn),endsOn:service==='care_home'?date(raw.endsOn):null,timeWindow:window,familyId:String(raw.familyId??'')||null,petId:String(raw.petId??'')||null,notes:boundedText(raw.notes??'',1200)}
 if(!/^[1-9]\d{5}$/.test(body.pin)||(service!=='care_home'&&raw.endsOn))reject('LOCATION','Enter a valid PIN code and care dates.',400)
 const hash=createHash('sha256').update(JSON.stringify(body)).digest('hex')
 await ensureSchema();return getDb().transaction(async tx=>{
  const user=await tx.one<{id:string;phone:string|null;email_verified_at:string|null}>("SELECT id,phone,email_verified_at FROM patient.users WHERE id=$1 AND status='ACTIVE' FOR UPDATE",[actorId]);if(!user)reject('FORBIDDEN','Sign in with an active account.',403)
  const old=await tx.one<{id:string;request_hash:string}>('SELECT id,request_hash FROM patient.home_care_requests WHERE user_id=$1 AND request_key=$2',[actorId,key]);if(old){if(old.request_hash!==hash)reject('IDEMPOTENCY','This request key was already used for different care details.',409);return old.id}
  if(!user.phone&&!user.email_verified_at)reject('CONTACT','Verify a phone number or email on your profile first.',400)
  if(audience==='pet'){
   if(body.familyId||!body.petId||!await tx.one('SELECT id FROM patient.pets WHERE id=$1 AND owner_id=$2 AND archived_at IS NULL FOR SHARE',[body.petId,actorId]))reject('SUBJECT','Choose one of your own pets.',403)
  }else if(body.petId||(body.familyId&&!await tx.one('SELECT id FROM patient.family_members WHERE id=$1 AND user_id=$2 AND archived_at IS NULL FOR SHARE',[body.familyId,actorId])))reject('SUBJECT','Choose yourself or one of your household members.',403)
  const valid=await tx.one<{ok:boolean}>("SELECT $1::date >= (now() AT TIME ZONE 'Asia/Kolkata')::date AND $1::date <= (now() AT TIME ZONE 'Asia/Kolkata')::date+365 AND ($2::date IS NULL OR ($2::date>$1::date AND $2::date<=$1::date+365)) ok",[body.startsOn,body.endsOn]);if(!valid?.ok)reject('DATE','Choose a future care date and an end date after the start.',400)
  const budget=await consumeLimits([{bucket:'home-care-account',key:actorId,limit:3,seconds:3600},{bucket:'home-care-global',key:'all',limit:60,seconds:3600}],tx);if(!budget.allowed)reject('LIMIT','Your request limit has been reached. Review your existing requests or try later.',429)
  const id='hc_'+randomUUID()
  await tx.query(`INSERT INTO patient.home_care_requests(id,user_id,service_kind,audience,family_id,pet_id,city,pin_code,starts_on,ends_on,time_window,encrypted_details,request_key,request_hash)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[id,actorId,service,audience,body.familyId,body.petId,body.city,body.pin,body.startsOn,body.endsOn,window,encryptSecret(JSON.stringify({notes:body.notes}),'home-care:'+id),key,hash])
  await tx.query("INSERT INTO patient.consents(id,actor_id,purpose,subject_id,version) VALUES($1,$2,'home-care-coordination',$3,'home-care-v1')",['cns_'+randomUUID(),actorId,id])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'home-care:requested',$2)",[actorId,id]);return id
 })
}
export async function ownHomeCareRequests(actorId:string){await ensureSchema();return getDb().transaction(async tx=>{
 if(!await tx.one("SELECT id FROM patient.users WHERE id=$1 AND status='ACTIVE'",[actorId]))reject('FORBIDDEN','Sign in required.',403)
 const rows=await tx.query<Stored>(`SELECT r.*,coalesce(p.name,f.name,'Yourself') subject_name FROM patient.home_care_requests r LEFT JOIN patient.pets p ON p.id=r.pet_id LEFT JOIN patient.family_members f ON f.id=r.family_id WHERE r.user_id=$1 ORDER BY r.created_at DESC LIMIT 100`,[actorId]);return rows.map(decode)
})}
export async function adminHomeCareRequests(adminId:string){await ensureSchema();return getDb().transaction(async tx=>{
 await adminAccess(tx,adminId)
 const rows=await tx.query<Stored&{contact_name:string;phone:string|null;email:string|null}>(`SELECT r.*,coalesce(p.name,f.name,'Account holder') subject_name,u.name contact_name,u.phone,CASE WHEN u.email_verified_at IS NOT NULL THEN u.email END email FROM patient.home_care_requests r JOIN patient.users u ON u.id=r.user_id LEFT JOIN patient.pets p ON p.id=r.pet_id LEFT JOIN patient.family_members f ON f.id=r.family_id WHERE u.status='ACTIVE' AND r.status IN ('REQUESTED','REVIEWING','CONTACTED') AND EXISTS(SELECT 1 FROM patient.consents c WHERE c.actor_id=r.user_id AND c.subject_id=r.id AND c.purpose='home-care-coordination' AND c.revoked_at IS NULL) ORDER BY r.created_at ASC LIMIT 200`)
 await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'home-care:queue-read','home-care')",[adminId]);return rows.map(row=>({...decode(row),contact_name:row.contact_name,phone:row.phone,email:row.email}))
})}
export async function changeHomeCareRequest(actorId:string,id:string,revision:number,next:string,note='',admin=false){
 if(!Number.isInteger(revision)||revision<0||!['REVIEWING','CONTACTED','CLOSED','CANCELLED'].includes(next))reject('STATE','Choose a valid request update.',400)
 const reviewNote=boundedText(note,1000,admin?5:0)
 await ensureSchema();return getDb().transaction(async tx=>{
  if(admin)await adminAccess(tx,actorId)
  else if(!await tx.one("SELECT id FROM patient.users WHERE id=$1 AND status='ACTIVE'",[actorId]))reject('FORBIDDEN','Sign in required.',403)
  const row=await tx.one<{user_id:string;status:string;revision:number;encrypted_details:string}>('SELECT user_id,status,revision,encrypted_details FROM patient.home_care_requests WHERE id=$1 FOR UPDATE',[id])
  if(!row||(!admin&&row.user_id!==actorId))reject('NOT_FOUND','That request is unavailable.',404)
  if(row.revision!==revision||['CLOSED','CANCELLED'].includes(row.status))reject('CHANGED','This request changed. Refresh before updating.',409)
  const transitions:Record<string,string[]>={REQUESTED:['REVIEWING'],REVIEWING:['CONTACTED','CLOSED'],CONTACTED:['CLOSED']}
  if(admin?!transitions[row.status]?.includes(next):next!=='CANCELLED')reject('STATE','That update is not available.',400)
  if(!admin)await tx.query("UPDATE patient.consents SET revoked_at=coalesce(revoked_at,now()) WHERE actor_id=$1 AND subject_id=$2 AND purpose='home-care-coordination'",[actorId,id])
  else if(!await tx.one("SELECT id FROM patient.consents WHERE actor_id=$1 AND subject_id=$2 AND purpose='home-care-coordination' AND revoked_at IS NULL",[row.user_id,id]))reject('CONSENT','Care coordination consent has been revoked.',409)
  const details=JSON.parse(decryptSecret(row.encrypted_details,'home-care:'+id)) as Details
  if(admin)details.reviewNote=reviewNote
  await tx.query('UPDATE patient.home_care_requests SET status=$2,revision=revision+1,updated_at=now(),encrypted_details=$3 WHERE id=$1',[id,next,encryptSecret(JSON.stringify(details),'home-care:'+id)])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource,detail) VALUES($1,'home-care:status',$2,$3::jsonb)",[actorId,id,JSON.stringify({from:row.status,to:next})])
 })
}
