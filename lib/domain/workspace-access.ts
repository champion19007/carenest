import 'server-only'
import {createHash} from 'node:crypto'
import {getDb,ensureSchema,type Db} from '@/lib/db/client'
import {localMode} from '@/lib/secrets'
import {reject,boundedText} from './errors'
export type WorkspaceDoctor={id:string;user_id:string;clinic_id:string;name:string;clinic:string;kind:string;fee:number;supported_species:string[];is_demo:boolean;verified_at:string|null;slug:string;speciality:string;city:string}
export async function workspaceDoctor(tx:Db,actorId:string,lock=false):Promise<WorkspaceDoctor>{
 const d=await tx.one<WorkspaceDoctor&{eligible:boolean}>(`SELECT d.*,(d.status='ACTIVE' AND u.status='ACTIVE' AND u.role='doctor' AND u.kyc_level='verified'
 AND c.status='ACTIVE' AND m.status='ACTIVE' AND m.role IN ('clinician','administrator') AND (d.verified_at IS NOT NULL OR ($2::boolean AND d.is_demo))) eligible
 FROM provider.doctors d JOIN patient.users u ON u.id=d.user_id JOIN clinic.clinics c ON c.id=d.clinic_id JOIN clinic.memberships m ON m.user_id=u.id AND m.clinic_id=c.id
 WHERE d.user_id=$1 ${lock?'FOR UPDATE OF d FOR SHARE OF u,c,m':'FOR SHARE OF d,u,c,m'}`,[actorId,localMode()])
 if(!d?.eligible)reject('FORBIDDEN','A current verified clinician and active clinic membership are required.',403)
 return d
}
export async function workspaceTransaction<T>(actorId:string,work:(tx:Db,d:WorkspaceDoctor)=>Promise<T>,lock=false){await ensureSchema();return getDb().transaction(async tx=>work(tx,await workspaceDoctor(tx,actorId,lock)))}
export async function workspaceAudit(tx:Db,actorId:string,action:string,resource:string){await tx.query('INSERT INTO audit_log(actor_id,action,resource) VALUES($1,$2,$3)',[actorId,action,resource])}
export function workspaceKey(raw:unknown){const key=boundedText(raw,128,16);if(!/^[A-Za-z0-9_-]+$/.test(key))reject('VALIDATION','Refresh the form before saving.',400);return key}
export function requestDigest(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex')}
export function dateOnly(raw:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)||Number.isNaN(new Date(raw).getTime())||new Date(raw).toISOString().slice(0,10)!==raw)reject('DATE','Choose a valid date.',400);return raw}
