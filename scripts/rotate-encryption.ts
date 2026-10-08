import {loadEnvConfig} from '@next/env'
import {randomUUID} from 'node:crypto'
import {readFile,writeFile,rename,unlink} from 'node:fs/promises'
import path from 'node:path'
import {createDatabase} from '../lib/db/adapters'
import {encryptSecret,decryptSecret} from '../lib/secrets'
import {assertLocalStopped,claimLocalMaintenance} from './local-lock.mjs'
async function main(){
loadEnvConfig(process.cwd(),true)
process.env.CARENEST_LOCAL_MODE='1'
await assertLocalStopped()
const release=await claimLocalMaintenance()
const execute=process.argv.includes('--execute'),active=process.env.DATA_ENCRYPTION_ACTIVE_ID
if(execute&&(!active||!process.env.DATA_ENCRYPTION_KEYRING))throw new Error('Configure a new named active key and retain old keys before executing rotation')
const db=await createDatabase(undefined),fileRoot=path.resolve(process.env.PRIVATE_FILE_ROOT??'.data/files')
type Spec={table:string;column:string;key?:string;json?:boolean;context:(r:Record<string,unknown>)=>string}
const specs:Spec[]=[
 {table:'documents',column:'body',json:true,context:r=>'clinical:'+r.id},
 {table:'provider.connections',column:'encrypted_tokens',context:r=>'connection:'+r.user_id+':'+r.provider},
 {table:'oauth_intents',column:'verifier',key:'state_hash',context:r=>'oauth:'+r.state_hash},
 {table:'video_sessions',column:'encrypted_join',context:r=>'room:'+r.id},
 {table:'admins',column:'totp_secret',context:r=>'admin:'+r.username},
 {table:'clinic.surgery_leads',column:'notes',context:r=>'enquiry:'+r.id},
 {table:'support_cases',column:'detail',context:r=>'support:'+r.id},
 {table:'clinic.people',column:'encrypted_identity',context:r=>'person:'+r.id},
 {table:'patient.addresses',column:'encrypted_address',context:r=>'address:'+r.id},
 {table:'patient.bookings',column:'encrypted_home_address',context:r=>'booking-home:'+r.id},
 {table:'patient.privacy_requests',column:'encrypted_detail',context:r=>'privacy:'+r.id},
 {table:'patient.privacy_requests',column:'encrypted_decision',context:r=>'privacy-decision:'+r.id},
 {table:'prescription_safety_reviews',column:'encrypted_detail',context:r=>'safety:'+r.record_id+':'+r.reviewer_id},
 {table:'pharmacy.orders',column:'encrypted_address',context:r=>'pharmacy-address:'+r.id},
 {table:'pharmacy.fulfilments',column:'encrypted_receipt',key:'order_id',context:r=>'pharmacy-receipt:'+r.order_id},
 {table:'integration_cases',column:'encrypted_payload',context:r=>'integration:'+r.id},
 {table:'data_reconciliation_cases',column:'encrypted_reason',context:r=>'reconcile:'+r.id},
]
try{
 const plan=[] as {spec:Spec;row:Record<string,unknown>;encrypted:string;plain:string}[]
 for(const spec of specs){for(const row of await db.query(`SELECT * FROM ${spec.table} WHERE ${spec.column} IS NOT NULL`)){const body=spec.json?row[spec.column] as Record<string,unknown>:null,encrypted=String(body?body._encrypted??'':row[spec.column]);if(!/^v[123]:/.test(encrypted)||spec.json&&!['chart_notes','prescriptions'].includes(String(row.collection)))continue;plan.push({spec,row,encrypted,plain:decryptSecret(encrypted,spec.context(row))})}}
 const files=[] as {filename:string;id:string;plain:string}[]
 for(const row of await db.query<{id:string;storage_key:string}>('SELECT id,storage_key FROM private_files')){if(!/^[a-f0-9-]{36}\.enc$/.test(row.storage_key))throw new Error('Invalid private object reference');const filename=path.join(fileRoot,row.storage_key),encrypted=await readFile(filename,'utf8');files.push({filename,id:row.id,plain:decryptSecret(encrypted,row.id)})}
 console.log(JSON.stringify({mode:execute?'execute':'dry-run',databaseEnvelopes:plan.length,privateObjects:files.length,allReadable:true,activeKeyId:active??'not-selected'}))
 if(execute){
  // Both old and new keys must remain available. A crash between file swaps and the
  // database transaction leaves a readable mixture of envelope versions, not lost keys.
  for(const file of files){const temp=file.filename+'.rotate-'+randomUUID();try{await writeFile(temp,encryptSecret(file.plain,file.id),{flag:'wx',mode:0o600});await rename(temp,file.filename)}finally{await unlink(temp).catch(()=>{})}}
  await db.transaction(async tx=>{for(const item of plan){const {spec,row}=item,encrypted=encryptSecret(item.plain,spec.context(row)),value=spec.json?JSON.stringify({...row[spec.column] as Record<string,unknown>,_encrypted:encrypted}):encrypted;if(spec.table==='documents')await tx.query("INSERT INTO document_maintenance_permits(document_id,operation,old_body,new_body,approved_by) VALUES($1,'KEY_ROTATION',$2::jsonb,$3::jsonb,'offline-local-maintenance')",[row.id,JSON.stringify(row.body),value]);await tx.query(`UPDATE ${spec.table} SET ${spec.column}=$2${spec.json?'::jsonb':''} WHERE ${spec.key??'id'}=$1`,[row[spec.key??'id'],value]);if(spec.table==='documents')await tx.query('DELETE FROM document_maintenance_permits WHERE document_id=$1',[row.id])}await tx.query("INSERT INTO audit_log(action,resource,detail) VALUES('encryption:rotate','local-storage',$1::jsonb)",[JSON.stringify({activeKeyId:active,envelopes:plan.length,objects:files.length})])})
  console.log('Rotation completed. Retain previous keys with every backup until its approved retention expires.')
 }
}finally{await db.close?.();await release()}

}
main().catch(()=>{console.error("Encryption inventory/rotation failed. Keep all existing keys and inspect configuration before retrying.");process.exitCode=1})
