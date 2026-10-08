import 'server-only'
import { randomUUID,createHash } from 'node:crypto'
import { getDb, ensureSchema, type Db } from '@/lib/db/client'
import { localMode,encryptSecret,decryptSecret } from '@/lib/secrets'
import { boundedText, reject } from './errors'
type Encounter = { id:string; booking_id:string|null;walk_in_id:string|null;clinic_person_id:string|null;person_kind:string|null;person_identity:string|null;person_owner:string|null;doctor_id:string; patient_user_id:string|null; family_id:string|null; pet_id:string|null;
  patient_name:string; doctor_name:string; doctor_user:string; provider_status:string; verified_at:string|null; is_demo:boolean;
  booking_status:string; started:boolean }
async function requireActor(tx:Db,id:string) {
  const actor=await tx.one<{role:string;kyc_level:string;status:string}>('SELECT role,kyc_level,status FROM patient.users WHERE id=$1 FOR SHARE',[id])
  if(!actor||!['ACTIVE','RESTRICTED'].includes(actor.status)) reject('FORBIDDEN','Your account cannot access this record.',403)
  return actor
}
export async function encounter(tx:Db,actorId:string,id:string,write=false) {
  const actor=await requireActor(tx,actorId)
  const row=await tx.one<Encounter>(`SELECT e.*, d.name doctor_name,d.user_id doctor_user,d.status provider_status,d.verified_at,d.is_demo,
    coalesce(p.name,f.name,u.name,'Clinic patient') patient_name,cp.kind person_kind,cp.encrypted_identity person_identity,cp.owner_id person_owner,
    coalesce(b.status,CASE w.state WHEN 'IN_PROGRESS' THEN 'confirmed' WHEN 'ATTENDED' THEN 'attended' ELSE lower(w.state) END) booking_status,
    (coalesce(b.started_at,w.started_at) IS NOT NULL) started
    FROM clinic.encounters e JOIN provider.doctors d ON d.id=e.doctor_id LEFT JOIN patient.bookings b ON b.id=e.booking_id
    LEFT JOIN clinic.walk_ins w ON w.id=e.walk_in_id LEFT JOIN clinic.people cp ON cp.id=e.clinic_person_id
    LEFT JOIN patient.users u ON u.id=e.patient_user_id LEFT JOIN patient.family_members f ON f.id=e.family_id
    LEFT JOIN patient.pets p ON p.id=e.pet_id WHERE e.id=$1 FOR SHARE OF e,d`,[id])
  if(!row) reject('NOT_FOUND','That care record is unavailable.',404)
  if(row.person_identity&&row.clinic_person_id)row.patient_name=String(JSON.parse(decryptSecret(row.person_identity,'person:'+row.clinic_person_id)).name)
  const patient=row.patient_user_id===actorId
  const clinician=actor.status==='ACTIVE' && actor.role==='doctor' && actor.kyc_level==='verified' && row.doctor_user===actorId && row.provider_status==='ACTIVE'
    && Boolean(row.verified_at || (row.is_demo && localMode()))
  if((write&&!clinician)||(!write&&!patient&&!clinician)) reject('FORBIDDEN','That care record is unavailable.',403)
  if(clinician) {
    if(await tx.one("SELECT c.id FROM clinic.clinics c JOIN provider.doctors d ON d.clinic_id=c.id WHERE d.id=$1 AND c.status<>'ACTIVE'",[row.doctor_id]))reject('FORBIDDEN','This clinic is not currently active.',403)
    const consent=row.walk_in_id?await tx.one(`SELECT p.id FROM clinic.people p WHERE p.id=$1 AND p.consent_attested_at IS NOT NULL AND (p.owner_id IS NULL OR EXISTS(SELECT 1 FROM patient.consents c WHERE c.subject_id=p.id AND c.actor_id=p.owner_id AND c.purpose='walk-in-sharing' AND c.revoked_at IS NULL))`,[row.clinic_person_id]):await tx.one("SELECT id FROM patient.consents WHERE booking_id=$1 AND purpose='appointment-sharing' AND revoked_at IS NULL FOR SHARE",[row.booking_id])
    if(!consent) reject('CONSENT','The patient has not granted current record access.',403)
  }
  if(write && (!['confirmed','attended'].includes(row.booking_status)||(!row.started && row.booking_status!=='attended'))) reject('STATE','Clinical records require an assigned consultation that has started.',409)
  return row
}
async function audit(tx:Db,actorId:string,id:string,action:string) {
  await tx.query('INSERT INTO audit_log(actor_id,action,resource) VALUES($1,$2,$3)',[actorId,action,id])
}
export async function readEncounter(actorId:string,id:string) {
  await ensureSchema()
  return getDb().transaction(async tx=>{
    const e=await encounter(tx,actorId,id)
    const records=await tx.query<{id:string;collection:string;body:Record<string,unknown>;created_at:string;revision:number}>(
      "SELECT id,collection,body,created_at,revision FROM documents WHERE encounter_id=$1 AND collection IN ('prescriptions','chart_notes') ORDER BY created_at,id",[id])
    await audit(tx,actorId,id,'clinical:read')
    return {encounter:e,records:records.map(r=>({...r,body:decodeRecord(r.id,r.body)}))}
  })
}
export async function writeClinicalRecord(input:{actorId:string;encounterId:string;kind:'chart_notes'|'prescriptions';body:unknown;supersedes?:string;requestKey?:string}) {
  const key=input.requestKey!==undefined?boundedText(input.requestKey,128,16):null
  if(key&&!/^[A-Za-z0-9_-]+$/.test(key))reject('VALIDATION','Refresh the encounter and try saving again.',400)
  const source=input.body
  if(!source||typeof source!=='object'||Array.isArray(source)) reject('VALIDATION','Check the clinical record fields.',400)
  const b=source as Record<string,unknown>
  let content:Record<string,unknown>
  if(input.kind==='chart_notes') {
    content={complaints:boundedText(b.complaints??'',2000),observations:boundedText(b.observations??'',4000),diagnosis:boundedText(b.diagnosis??'',2000)}
    if(!Object.values(content).some(Boolean)) reject('VALIDATION','Enter a clinical note before saving.',400)
  } else {
    if(!Array.isArray(b.drugs)||b.drugs.length<1||b.drugs.length>20) reject('VALIDATION','Enter between 1 and 20 prescribed medicines.',400)
    const drugs=b.drugs.map(value=>{
      if(!value||typeof value!=='object'||Array.isArray(value)) reject('VALIDATION','Check each medicine.',400)
      const d=value as Record<string,unknown>,days=String(d.days??'')
      if(!/^\d{1,3}$/.test(days)||Number(days)<1||Number(days)>365) reject('VALIDATION','Medicine duration must be 1–365 days.',400)
      return {drug:boundedText(d.drug,120,2),dose:boundedText(d.dose,120,1),frequency:boundedText(d.frequency,80,1),intake:boundedText(d.intake??'',80),days}
    })
    content={drugs,advice:boundedText(b.advice??'',2000)}
  }
  await ensureSchema()
  return getDb().transaction(async tx=>{
    const e=await encounter(tx,input.actorId,input.encounterId,true)
    const requestHash=createHash('sha256').update(JSON.stringify([input.kind,content,input.supersedes??null])).digest('hex')
    const id=key?'doc_'+createHash('sha256').update(JSON.stringify([input.actorId,e.id,input.kind,key])).digest('hex'):'doc_'+randomUUID()
    async function replay(){const prior=await tx.one<{body:Record<string,unknown>}>('SELECT body FROM documents WHERE id=$1 AND encounter_id=$2 AND clinician_id=$3',[id,e.id,e.doctor_id]);if(!prior)return false;const body=typeof prior.body._encrypted==='string'?JSON.parse(decryptSecret(prior.body._encrypted,'clinical:'+id)):prior.body;if(body._requestHash!==requestHash)reject('IDEMPOTENCY_CONFLICT','This save request already contains different clinical content. Refresh before creating another record.');await audit(tx,input.actorId,id,'clinical:write-replay');return true}
    if(key&&await replay())return id
    let revision=1
    if(input.supersedes) {
      const prior=await tx.one<{revision:number}>('SELECT revision FROM documents WHERE id=$1 AND encounter_id=$2 AND clinician_id=$3 AND collection=$4 FOR UPDATE',
        [input.supersedes,e.id,e.doctor_id,input.kind])
      if(!prior) reject('FORBIDDEN','That record cannot be amended.',403)
      if(await tx.one('SELECT id FROM documents WHERE supersedes=$1',[input.supersedes]))reject('CHANGED','That record already has an amendment. Use its latest version.')
      revision=prior.revision+1
    }
    const inserted=await tx.one(`INSERT INTO documents(id,collection,subject_id,body,encounter_id,owner_id,clinician_id,revision,supersedes)
      VALUES($1,$2,$3,$4::jsonb,$5,$9,$6,$7,$8) ON CONFLICT(id) DO NOTHING RETURNING id`,[id,input.kind,e.patient_user_id??e.clinic_person_id,
      JSON.stringify({_encrypted:encryptSecret(JSON.stringify({...content,patientId:e.clinic_person_id??e.pet_id??e.family_id??e.patient_user_id,subjectId:e.clinic_person_id??e.pet_id??e.family_id??e.patient_user_id,ownerId:e.patient_user_id,patientName:e.patient_name,doctorId:e.doctor_id,doctorName:e.doctor_name,subjectKind:e.person_kind??(e.pet_id?'pet':'human'),...(key?{_requestHash:requestHash}:{})}),'clinical:'+id)}),
      e.id,e.doctor_id,revision,input.supersedes??null,e.patient_user_id])
    if(!inserted){if(key&&await replay())return id;reject('CHANGED','The clinical record changed. Refresh and try again.')}
    await audit(tx,input.actorId,id,'clinical:write')
    return id
  })
}
export async function patientRecords(actorId:string,options:{recordId?:string;all?:boolean}={}) {
  await ensureSchema()
  return getDb().transaction(async tx=>{
    await requireActor(tx,actorId)
    const rows=await tx.query<{id:string;collection:string;body:Record<string,unknown>;created_at:string;encounter_id:string}>(
      `SELECT d.id,d.collection,d.body,d.created_at,d.encounter_id FROM documents d JOIN clinic.encounters e ON e.id=d.encounter_id
       WHERE (d.owner_id=$1 OR (d.owner_id IS NULL AND e.clinic_person_id IS NOT NULL)) AND e.patient_user_id=$1 AND d.collection IN ('prescriptions','chart_notes') AND ($2::text IS NULL OR d.id=$2) ORDER BY d.created_at DESC ${options.all?'':'LIMIT 200'}`,[actorId,options.recordId??null])
    await audit(tx,actorId,actorId,'clinical:read-own-records')
    return rows.map(r=>({...r,body:decodeRecord(r.id,r.body)}))
  })
}
export async function clinicEncounters(actorId:string) {
  await ensureSchema()
  return getDb().transaction(async tx=>{
    const user=await requireActor(tx,actorId)
    const doctor=await tx.one<{id:string;status:string;verified_at:string|null;is_demo:boolean}>('SELECT id,status,verified_at,is_demo FROM provider.doctors WHERE user_id=$1',[actorId])
    if(user.status!=='ACTIVE'||user.role!=='doctor'||user.kyc_level!=='verified'||doctor?.status!=='ACTIVE'||(!doctor.verified_at&&!(doctor.is_demo&&localMode()))) reject('FORBIDDEN','Current verified clinical access is required.',403)
    const rows=await tx.query<{id:string;booking_id:string;patient_name:string;status:string;starts_at:string;subject_kind:string}>(
      `SELECT e.id,e.booking_id,e.clinic_person_id,cp.encrypted_identity person_identity,coalesce(p.name,f.name,u.name,'Clinic patient') patient_name,coalesce(b.status,lower(w.state)) status,coalesce(b.starts_at,w.checked_in_at) starts_at,
       coalesce(cp.kind,CASE WHEN e.pet_id IS NOT NULL THEN 'pet' ELSE 'human' END) subject_kind
       FROM clinic.encounters e LEFT JOIN patient.bookings b ON b.id=e.booking_id LEFT JOIN clinic.walk_ins w ON w.id=e.walk_in_id LEFT JOIN clinic.people cp ON cp.id=e.clinic_person_id LEFT JOIN patient.users u ON u.id=e.patient_user_id
       LEFT JOIN patient.family_members f ON f.id=e.family_id LEFT JOIN patient.pets p ON p.id=e.pet_id
       WHERE e.doctor_id=$1
       AND NOT EXISTS(SELECT 1 FROM provider.doctors pd JOIN clinic.clinics c ON c.id=pd.clinic_id WHERE pd.id=e.doctor_id AND c.status<>'ACTIVE')
       AND ((e.walk_in_id IS NULL AND EXISTS(SELECT 1 FROM patient.consents c WHERE c.booking_id=e.booking_id AND c.purpose='appointment-sharing' AND c.revoked_at IS NULL))
       OR (e.walk_in_id IS NOT NULL AND cp.consent_attested_at IS NOT NULL AND (cp.owner_id IS NULL OR EXISTS(SELECT 1 FROM patient.consents c WHERE c.actor_id=cp.owner_id AND c.subject_id=cp.id AND c.purpose='walk-in-sharing' AND c.revoked_at IS NULL))))
       ORDER BY coalesce(b.starts_at,w.checked_in_at) DESC LIMIT 200`,[doctor.id])
    await audit(tx,actorId,doctor.id,'clinical:read-panel')
    return rows.map(r=>{const person=r as typeof r&{clinic_person_id?:string;person_identity?:string};if(person.clinic_person_id&&person.person_identity)return {...r,patient_name:String(JSON.parse(decryptSecret(person.person_identity,'person:'+person.clinic_person_id)).name),person_identity:undefined};return r})
  })
}
export function decodeRecord(id:string,body:Record<string,unknown>):Record<string,unknown> {
  const decoded=typeof body._encrypted==='string'?JSON.parse(decryptSecret(body._encrypted,'clinical:'+id)):body
  const {_requestHash,...content}=decoded;return content
}
