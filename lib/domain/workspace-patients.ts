import 'server-only'
import {encryptSecret,decryptSecret} from '@/lib/secrets'
import type {Db} from '@/lib/db/client'
import {isPetSpecies} from '@/lib/species'
import {normalizePhone} from './otp'
import {boundedText,reject} from './errors'
import {workspaceTransaction,workspaceKey,requestDigest,workspaceAudit,dateOnly,type WorkspaceDoctor} from './workspace-access'
export type ClinicIdentity={name:string;phone:string;email:string;dob:string|null;sex:string;species:string;guardian:string;reason:string;bloodGroup:string}
export function clinicIdentity(d:WorkspaceDoctor,raw:Record<string,unknown>):ClinicIdentity{
 const phone=normalizePhone(String(raw.phone??'')),email=boundedText(raw.email??'',254).toLowerCase(),dob=raw.dob?dateOnly(String(raw.dob)):null
 if(!phone||raw.consent!==true)reject('CONSENT','Record a valid contact and the patient or guardian’s actual consent to clinic record sharing.',400)
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))reject('EMAIL','Check the email address.',400)
 if(dob&&new Date(dob)>new Date())reject('DATE','A birth date cannot be in the future.',400)
 const identity={name:boundedText(raw.name,80,2),phone,email,dob,sex:boundedText(raw.sex??'Unknown',20),species:boundedText(raw.species??'',20),guardian:boundedText(raw.guardian??'',80),reason:boundedText(raw.reason??'',2000),bloodGroup:boundedText(raw.bloodGroup??'Unknown',10)}
 if(!['Male','Female','Other','Unknown'].includes(identity.sex)||!['Unknown','A+','A-','B+','B-','AB+','AB-','O+','O-'].includes(identity.bloodGroup))reject('VALIDATION','Choose a listed sex and blood group.',400)
 if(d.kind==='vet'&&(!isPetSpecies(identity.species)||!d.supported_species.includes(identity.species)||identity.guardian.length<2))reject('SPECIES','Choose a supported species and enter the guardian name.',400)
 return identity
}
export async function createClinicPerson(tx:Db,d:WorkspaceDoctor,actorId:string,raw:Record<string,unknown>,key:string){
 const identity=clinicIdentity(d,raw),hash=requestDigest([d.id,identity]),id='person_'+requestDigest([d.id,key])
 const existing=await tx.one<{id:string;request_hash:string}>('SELECT id,request_hash FROM clinic.people WHERE id=$1 AND clinic_id=$2',[id,d.clinic_id])
 if(existing){if(existing.request_hash!==hash)reject('IDEMPOTENCY','This patient request has different details. Refresh before creating another contact.');return id}
 await tx.query('INSERT INTO clinic.people(id,clinic_id,kind,encrypted_identity,created_by,consent_attested_at,request_hash) VALUES($1,$2,$3,$4,$5,now(),$6)',[id,d.clinic_id,d.kind==='vet'?'pet':'human',encryptSecret(JSON.stringify(identity),'person:'+id),actorId,hash])
 await workspaceAudit(tx,actorId,'practice:patient-created',id);return id
}
export async function registerClinicPatient(actorId:string,raw:Record<string,unknown>,rawKey:unknown){const key=workspaceKey(rawKey);return workspaceTransaction(actorId,(tx,d)=>createClinicPerson(tx,d,actorId,raw,key),true)}
export async function clinicPerson(tx:Db,d:WorkspaceDoctor,actorId:string,id:string){
 const person=await tx.one<{id:string;kind:string;owner_id:string|null;encrypted_identity:string;consent_ok:boolean;claim_live:boolean}>(`SELECT p.*,(p.claim_hash IS NOT NULL AND p.claim_expires_at>now()) claim_live,(p.consent_attested_at IS NOT NULL AND (p.owner_id IS NULL OR EXISTS(SELECT 1 FROM patient.consents c WHERE c.subject_id=p.id AND c.actor_id=p.owner_id AND c.purpose='walk-in-sharing' AND c.revoked_at IS NULL))) consent_ok FROM clinic.people p
 WHERE p.id=$1 AND p.clinic_id=$2 AND (p.created_by=$3 OR EXISTS(SELECT 1 FROM clinic.walk_ins w WHERE w.person_id=p.id AND w.doctor_id=$4) OR EXISTS(SELECT 1 FROM clinic.scheduled_visits v WHERE v.person_id=p.id AND v.doctor_id=$4)) FOR SHARE OF p`,[id,d.clinic_id,actorId,d.id])
 if(!person?.consent_ok)reject('CONSENT','This patient is unavailable or has not granted current clinic access.',403)
 if((person.kind==='pet')!==(d.kind==='vet'))reject('SPECIES','This patient needs a different type of practitioner.',400)
 return {...person,identity:JSON.parse(decryptSecret(person.encrypted_identity,'person:'+person.id)) as ClinicIdentity}
}
export async function clinicContacts(actorId:string){return workspaceTransaction(actorId,async(tx,d)=>{
 const people=await tx.query<{id:string;kind:string;encrypted_identity:string;created_at:string}>(`SELECT p.id,p.kind,p.encrypted_identity,p.created_at FROM clinic.people p WHERE p.clinic_id=$1
 AND (p.created_by=$2 OR EXISTS(SELECT 1 FROM clinic.walk_ins w WHERE w.person_id=p.id AND w.doctor_id=$3) OR EXISTS(SELECT 1 FROM clinic.scheduled_visits v WHERE v.person_id=p.id AND v.doctor_id=$3))
 AND (p.owner_id IS NULL OR EXISTS(SELECT 1 FROM patient.consents c WHERE c.subject_id=p.id AND c.actor_id=p.owner_id AND c.purpose='walk-in-sharing' AND c.revoked_at IS NULL)) ORDER BY p.created_at DESC LIMIT 500`,[d.clinic_id,actorId,d.id])
 await workspaceAudit(tx,actorId,'practice:contacts-read',d.id)
 return people.map(({encrypted_identity,...p})=>({...p,identity:JSON.parse(decryptSecret(encrypted_identity,'person:'+p.id)) as ClinicIdentity}))
})}
export async function editClinicPatient(actorId:string,id:string,raw:Record<string,unknown>){return workspaceTransaction(actorId,async(tx,d)=>{
 await clinicPerson(tx,d,actorId,id);const identity=clinicIdentity(d,raw)
 await tx.query('UPDATE clinic.people SET encrypted_identity=$2 WHERE id=$1',[id,encryptSecret(JSON.stringify(identity),'person:'+id)])
 await workspaceAudit(tx,actorId,'practice:patient-updated',id)
},true)}
