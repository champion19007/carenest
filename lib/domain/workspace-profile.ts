import 'server-only'
import {getDb,ensureSchema} from '@/lib/db/client'
import {localMode} from '@/lib/secrets'
import {workspaceTransaction,workspaceAudit} from './workspace-access'
export async function workspaceFeedback(actorId:string){return workspaceTransaction(actorId,async(tx,d)=>{
 const reviews=await tx.query<{id:string;rating:string;comment:string;created_at:string}>("SELECT id,body->>'rating' rating,body->>'comment' comment,created_at FROM documents WHERE collection='reviews' AND subject_id=$1 ORDER BY created_at DESC LIMIT 100",[d.id])
 const summary=await tx.one<{count:string;rating:string|null}>("SELECT count(*) count,avg((body->>'rating')::numeric) rating FROM documents WHERE collection='reviews' AND subject_id=$1",[d.id]);await workspaceAudit(tx,actorId,'practice:feedback-read',d.id);return {doctor:d,reviews,summary}
})}
/** The public widget reads only the reviewed directory fields, never clinic contacts or records. */
export async function publicClinicWidget(slug:string){await ensureSchema();return getDb().one<{name:string;slug:string;clinic:string;city:string;speciality:string;fee:number;is_demo:boolean}>(`SELECT d.name,d.slug,d.clinic,d.city,d.speciality,d.fee,d.is_demo FROM provider.doctors d JOIN patient.users u ON u.id=d.user_id JOIN clinic.clinics c ON c.id=d.clinic_id WHERE d.slug=$1 AND d.status='ACTIVE' AND u.status='ACTIVE' AND u.role='doctor' AND u.kyc_level='verified' AND c.status='ACTIVE' AND EXISTS(SELECT 1 FROM clinic.memberships m WHERE m.clinic_id=d.clinic_id AND m.user_id=d.user_id AND m.status='ACTIVE' AND m.role IN ('clinician','administrator')) AND (d.verified_at IS NOT NULL OR ($2::boolean AND d.is_demo))`,[slug,localMode()])}
