import 'server-only'
import {randomUUID} from 'node:crypto'
import {encryptSecret,decryptSecret} from '@/lib/secrets'
import {rupeesToPaise} from '@/lib/money'
import {boundedText,reject} from './errors'
import {workspaceTransaction,workspaceAudit} from './workspace-access'
export type WorkspacePreferences={profile:{clinicName:string;phone:string;email:string;website:string;address:string;city:string;pinCode:string;facilityId:string;gstin:string};communications:{sms:boolean;email:boolean;whatsapp:boolean;confirmations:boolean;cancellations:boolean;reminders:boolean;payments:boolean};print:{paper:'A4'|'A5';showContact:boolean;footer:string};email:{footer:string};calendar:{startHour:number;endHour:number;defaultView:'day'|'week'|'month'|'agenda'}}
export const defaultWorkspacePreferences:WorkspacePreferences={profile:{clinicName:'',phone:'',email:'',website:'',address:'',city:'',pinCode:'',facilityId:'',gstin:''},communications:{sms:true,email:true,whatsapp:true,confirmations:true,cancellations:true,reminders:true,payments:true},print:{paper:'A4',showContact:true,footer:''},email:{footer:''},calendar:{startHour:8,endHour:20,defaultView:'week'}}
export function decodePreferences(doctorId:string,encrypted?:string):WorkspacePreferences{const saved=encrypted?JSON.parse(decryptSecret(encrypted,'workspace:'+doctorId)):{};return Object.fromEntries(Object.entries(defaultWorkspacePreferences).map(([key,value])=>[key,{...value,...saved[key]}])) as WorkspacePreferences}
export async function workspaceSettings(actorId:string){return workspaceTransaction(actorId,async(tx,d)=>{
 const row=await tx.one<{encrypted_body:string;revision:number}>('SELECT * FROM clinic.workspace_preferences WHERE doctor_id=$1',[d.id]);await workspaceAudit(tx,actorId,'practice:settings-read',d.id)
 const staff=await tx.query<{name:string;role:string;status:string}>(`SELECT u.name,m.role,m.status FROM clinic.memberships m JOIN patient.users u ON u.id=m.user_id WHERE m.clinic_id=$1 ORDER BY m.role,u.name`,[d.clinic_id])
 return {doctor:d,preferences:decodePreferences(d.id,row?.encrypted_body),revision:row?.revision??0,staff}
})}
export async function saveWorkspaceSettings(actorId:string,section:keyof WorkspacePreferences,raw:Record<string,unknown>,revision:number){return workspaceTransaction(actorId,async(tx,d)=>{
 if(!Object.hasOwn(defaultWorkspacePreferences,section)||!Number.isInteger(revision)||revision<0)reject('VALIDATION','Refresh the settings before saving.',400)
 const row=await tx.one<{encrypted_body:string;revision:number}>('SELECT * FROM clinic.workspace_preferences WHERE doctor_id=$1 FOR UPDATE',[d.id]);if((row?.revision??0)!==revision)reject('CHANGED','These settings changed. Refresh before saving.',409)
 const value=decodePreferences(d.id,row?.encrypted_body)
 if(section==='profile'){
  const profile=Object.fromEntries(Object.keys(value.profile).map(key=>[key,boundedText(raw[key]??'',key==='address'?500:key==='website'?500:key==='email'?254:80)])) as WorkspacePreferences['profile']
  if(profile.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)||profile.pinCode&&!/^\d{6}$/.test(profile.pinCode)||profile.gstin&&!/^[A-Z0-9]{15}$/.test(profile.gstin))reject('VALIDATION','Check the email, PIN code and optional tax identifier.',400)
  if(profile.website){let website;try{website=new URL(profile.website)}catch{reject('WEBSITE','Enter a full HTTPS clinic website URL.',400)}if(website!.protocol!=='https:'||website!.username||website!.password||website!.hash)reject('WEBSITE','Use a public HTTPS clinic website without credentials.',400)}
  value.profile=profile
 }else if(section==='communications')value.communications=Object.fromEntries(Object.keys(value.communications).map(key=>[key,raw[key]===true])) as WorkspacePreferences['communications']
 else if(section==='print'){if(!['A4','A5'].includes(String(raw.paper)))reject('PRINT','Choose A4 or A5.',400);value.print={paper:raw.paper as 'A4'|'A5',showContact:raw.showContact===true,footer:boundedText(raw.footer??'',500)}}
 else if(section==='email')value.email={footer:boundedText(raw.footer??'',500)}
 else{const start=Number(raw.startHour),end=Number(raw.endHour),view=String(raw.defaultView);if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>24||start>=end||!['day','week','month','agenda'].includes(view))reject('CALENDAR','Check the calendar display hours and default view.',400);value.calendar={startHour:start,endHour:end,defaultView:view as WorkspacePreferences['calendar']['defaultView']}}
 await tx.query('INSERT INTO clinic.workspace_preferences(doctor_id,encrypted_body,revision) VALUES($1,$2,1) ON CONFLICT(doctor_id) DO UPDATE SET encrypted_body=$2,revision=clinic.workspace_preferences.revision+1,updated_at=now()',[d.id,encryptSecret(JSON.stringify(value),'workspace:'+d.id)]);await workspaceAudit(tx,actorId,'practice:settings-'+section,d.id)
},true)}
export type CatalogueKind='NOTE'|'DRUG'|'PROCEDURE'|'TEMPLATE'|'CONSENT'
export async function workspaceCatalogue(actorId:string,kind?:CatalogueKind){return workspaceTransaction(actorId,async(tx,d)=>{
 const rows=await tx.query<{id:string;kind:CatalogueKind;label:string;encrypted_body:string;revision:number}>('SELECT * FROM clinic.workspace_catalogue WHERE doctor_id=$1 AND status=\'ACTIVE\' AND ($2::text IS NULL OR kind=$2) ORDER BY kind,label LIMIT 500',[d.id,kind??null]);await workspaceAudit(tx,actorId,'practice:catalogue-read',d.id)
 return rows.map(({encrypted_body,...r})=>({...r,body:JSON.parse(decryptSecret(encrypted_body,'catalogue:'+r.id)) as Record<string,string>}))
})}
export async function saveCatalogueItem(actorId:string,input:{id?:string;kind:CatalogueKind;label:string;body:Record<string,unknown>;revision:number}){return workspaceTransaction(actorId,async(tx,d)=>{
 if(!['NOTE','DRUG','PROCEDURE','TEMPLATE','CONSENT'].includes(input.kind))reject('VALIDATION','Choose a catalogue type.',400)
 const label=boundedText(input.label,100,2),body:Record<string,string>={text:boundedText(input.body.text??'',4000)}
 if(input.kind==='DRUG'){for(const key of ['dose','frequency','intake','days'])body[key]=boundedText(input.body[key]??'',120);if(body.days&&(!/^\d{1,3}$/.test(body.days)||Number(body.days)<1||Number(body.days)>365))reject('DURATION','A saved medicine duration must be 1–365 days.',400)}
 if(input.kind==='PROCEDURE'){try{body.feePaise=rupeesToPaise(String(input.body.fee??''));if(BigInt(body.feePaise)>100000000n)throw new Error()}catch{reject('AMOUNT','Enter a valid catalogue fee up to ₹10 lakh.',400)}}
 const id=input.id||'catalogue_'+randomUUID();if(input.id){const current=await tx.one<{revision:number;kind:string}>('SELECT revision,kind FROM clinic.workspace_catalogue WHERE id=$1 AND doctor_id=$2 AND status=\'ACTIVE\' FOR UPDATE',[id,d.id]);if(!current||current.revision!==input.revision||current.kind!==input.kind)reject('CHANGED','This catalogue item changed or is unavailable.',409);await tx.query('UPDATE clinic.workspace_catalogue SET label=$2,encrypted_body=$3,revision=revision+1 WHERE id=$1',[id,label,encryptSecret(JSON.stringify(body),'catalogue:'+id)])}
 else await tx.query('INSERT INTO clinic.workspace_catalogue(id,doctor_id,kind,label,encrypted_body) VALUES($1,$2,$3,$4,$5)',[id,d.id,input.kind,label,encryptSecret(JSON.stringify(body),'catalogue:'+id)])
 await workspaceAudit(tx,actorId,'practice:catalogue-saved',id);return id
},true)}
export async function archiveCatalogueItem(actorId:string,id:string,revision:number){return workspaceTransaction(actorId,async(tx,d)=>{if(!await tx.one('UPDATE clinic.workspace_catalogue SET status=\'ARCHIVED\',revision=revision+1 WHERE id=$1 AND doctor_id=$2 AND revision=$3 AND status=\'ACTIVE\' RETURNING id',[id,d.id,revision]))reject('CHANGED','This catalogue item changed or is unavailable.',409);await workspaceAudit(tx,actorId,'practice:catalogue-archived',id)},true)}
