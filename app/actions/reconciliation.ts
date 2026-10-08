'use server'
import {currentAdmin} from '@/lib/auth'
import {scanLegacyDocuments,reconcileDocument} from '@/lib/domain/reconciliation'
import {DomainError} from '@/lib/domain/errors'
import {revalidatePath} from 'next/cache'
export type ReconcileState={error?:string;notice?:string}
export async function scanLegacy(_s:ReconcileState):Promise<ReconcileState>{const a=await currentAdmin();if(!a)return {error:'MFA administrator required.'};const count=await scanLegacyDocuments(a.id);revalidatePath('/admin/reconciliation');return {notice:`Reviewed inventory created for ${count} unscoped records; plaintext bodies encrypted. No ownership was guessed.`}}
export async function linkLegacy(_s:ReconcileState,f:FormData):Promise<ReconcileState>{const a=await currentAdmin();if(!a)return {error:'MFA administrator required.'};try{await reconcileDocument(a.id,String(f.get('id')),String(f.get('encounterId')),String(f.get('evidence')),f.get('checked')==='on');revalidatePath('/admin/reconciliation');return {notice:'Verified source identifiers linked to the existing encounter; source hash retained.'}}catch(e){if(e instanceof DomainError)return {error:e.message};throw e}}
