import 'server-only'
import {clinicEncounters,readEncounter} from './clinical'
import {clinicContacts} from './workspace-patients'
import {istDate} from '@/lib/practice-calendar'
import {workspaceTransaction,workspaceAudit} from './workspace-access'
type Scheduled={id:string;person_id:string;starts_at:string;ends_at:string;state:string;revision:number}
export type WorkspacePatient={id:string;personId:string|null;name:string;kind:string;phone:string|null;email:string|null;dob:string|null;sex:string|null;guardian:string|null;bloodGroup:string;latestAt:string;latestState:string;visits:Awaited<ReturnType<typeof clinicEncounters>>;scheduled:Scheduled[]}
export async function workspacePatients(actorId:string,raw:{view?:string;q?:string;subject?:string;encounter?:string}){
 const [encounters,contacts,scheduled]=await Promise.all([clinicEncounters(actorId),clinicContacts(actorId),workspaceTransaction(actorId,async(tx,d)=>{const rows=await tx.query<Scheduled>("SELECT id,person_id,starts_at,ends_at,state,revision FROM clinic.scheduled_visits WHERE doctor_id=$1 AND state='SCHEDULED' ORDER BY starts_at LIMIT 500",[d.id]);await workspaceAudit(tx,actorId,'practice:patient-schedule-read',d.id);return rows})]),grouped=new Map<string,WorkspacePatient>()
 for(const p of contacts)grouped.set('person:'+p.id,{id:'person:'+p.id,personId:p.id,name:p.identity.name,kind:p.kind,phone:p.identity.phone,email:p.identity.email,dob:p.identity.dob,sex:p.identity.sex,guardian:p.identity.guardian,bloodGroup:p.identity.bloodGroup??'Unknown',latestAt:p.created_at,latestState:'new',visits:[],scheduled:[]})
 for(const e of encounters){let p=grouped.get(e.subject_id);if(!p){p={id:e.subject_id,personId:e.clinic_person_id,name:e.patient_name,kind:e.subject_kind,phone:e.phone,email:e.email,dob:e.dob,sex:e.sex,guardian:e.guardian,bloodGroup:'Unknown',latestAt:e.starts_at,latestState:e.status,visits:[],scheduled:[]};grouped.set(e.subject_id,p)}p.visits.push(e);if(e.starts_at>=p.latestAt||p.latestState==='new'){p.latestAt=e.starts_at;p.latestState=e.status}}
 for(const visit of scheduled){const p=grouped.get('person:'+visit.person_id);if(p){p.scheduled.push(visit);if(visit.starts_at>p.latestAt){p.latestAt=visit.starts_at;p.latestState='SCHEDULED'}}}
 const view=['today','recent','all'].includes(raw.view??'')?raw.view!:'today',q=(raw.q??'').trim().slice(0,80).toLocaleLowerCase(),today=istDate()
 const all=Array.from(grouped.values()),todayPatient=(p:WorkspacePatient)=>p.visits.some(e=>istDate(e.starts_at)===today)||p.scheduled.some(v=>istDate(v.starts_at)===today),patients=all.filter(p=>(!q||[p.name,p.phone??'',p.id].some(value=>value.toLocaleLowerCase().includes(q)))&&(view!=='today'||todayPatient(p))).sort((a,b)=>view==='all'?a.name.localeCompare(b.name):b.latestAt.localeCompare(a.latestAt)).slice(0,view==='recent'?100:500)
 const matched=raw.subject?all.find(p=>p.id===raw.subject):raw.encounter?all.find(p=>p.visits.some(e=>e.id===raw.encounter)):patients[0]
 if(view==='today')for(const p of patients){const visit=p.visits.find(e=>istDate(e.starts_at)===today);p.latestState=visit?(visit.status.toLowerCase()==='attended'?'ATTENDED':visit.started?'IN_PROGRESS':visit.checked_in_at?'ARRIVED':visit.status.toUpperCase()):'SCHEDULED'}
 const selected=matched??null,active=selected?.visits.find(e=>e.id===raw.encounter)??selected?.visits[0]??null
 const chart=active?await readEncounter(actorId,active.id):null
 return {view,q,patients,selected,active,chart,counts:{today:all.filter(todayPatient).length,recent:Math.min(100,all.length),all:all.length}}
}
