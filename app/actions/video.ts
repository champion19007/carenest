'use server'
import {requireRole} from '@/lib/auth'
import {getDb,ensureSchema} from '@/lib/db/client'
import {revalidatePath} from 'next/cache'
import {livekitConfigured} from '@/lib/domain/livekit'
import {reject} from '@/lib/domain/errors'
export async function selectVideoProvider(form:FormData){
 const u=await requireRole('doctor','/practice/integrations'),provider=String(form.get('provider'));await ensureSchema()
 if(!['livekit','google'].includes(provider))reject('PROVIDER','Choose a supported video service.',400)
 if(provider==='livekit'&&!livekitConfigured())reject('CONFIGURATION','Set up the local video service first.',503)
 await getDb().transaction(async tx=>{
 const d=await tx.one<{id:string}>("SELECT d.id FROM provider.doctors d JOIN patient.users u ON u.id=d.user_id WHERE d.user_id=$1 AND d.status='ACTIVE' AND u.status='ACTIVE' AND u.role='doctor' AND u.kyc_level='verified' FOR UPDATE OF d,u",[u.id]);if(!d)reject('FORBIDDEN','Current verified clinician access required.',403)
 if(provider==='google'&&!await tx.one("SELECT id FROM provider.connections WHERE user_id=$1 AND provider='google' AND revoked_at IS NULL",[u.id]))reject('CONNECTION','Connect your Google account first.',409)
 if(await tx.one("SELECT id FROM patient.bookings WHERE doctor_id=$1 AND kind='video' AND status IN ('requested','confirmed') LIMIT 1",[d!.id]))reject('ACTIVE_VISITS','Complete or cancel pending video appointments before changing the video service.',409)
 await tx.query('UPDATE provider.doctors SET video_provider=$2,video=true WHERE user_id=$1',[u.id,provider]);await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'video:preference',$2)",[u.id,provider])
 });revalidatePath('/practice/integrations')
}
