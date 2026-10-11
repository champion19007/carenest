import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createDatabase} from '../lib/db/adapters.ts'
import {schemaStatements,addUser,addDoctor} from './helpers.mjs'
import {loadServices} from './service-loader.mjs'
const run=promisify(execFile)
test('the actual key-rotation command rotates all workspace envelope contexts without losing readability',async()=>{
 const original={...process.env},root=process.cwd(),directory=await mkdtemp(path.join(root,'.data','rotation-workspace-test-'));let db
 assert.ok(!path.relative(path.join(root,'.data'),directory).startsWith('..'))
 try{
  Object.assign(process.env,{CARENEST_LOCAL_MODE:'1',DATA_ENCRYPTION_KEY:'1'.repeat(64),AUTH_SECRET:'rotation-fixture-'.repeat(4)});delete process.env.DATA_ENCRYPTION_ACTIVE_ID;delete process.env.DATA_ENCRYPTION_KEYRING
  db=await createDatabase(undefined,path.join(directory,'.data','pg'));await db.exec(schemaStatements().join(';'))
  await addUser(db,'rotation-clinician','9000000028','doctor');await addDoctor(db,'doctor');await db.query("INSERT INTO clinic.clinics(id,name) VALUES('clinic','Rotation fixture clinic')");await db.query("UPDATE provider.doctors SET user_id='rotation-clinician',clinic_id='clinic' WHERE id='doctor'")
  const secrets=loadServices(db)('lib/secrets.ts'),cipher=context=>secrets.encryptSecret('fictional private value',context)
  await db.query("INSERT INTO clinic.people(id,clinic_id,kind,encrypted_identity,created_by,consent_attested_at) VALUES('rotation-person','clinic','human',$1,'rotation-clinician',now())",[cipher('person:rotation-person')])
  await db.query("INSERT INTO clinic.scheduled_visits(id,doctor_id,clinic_id,person_id,starts_at,ends_at,fee_paise,encrypted_details,created_by,request_key,request_hash) VALUES('rotation-visit','doctor','clinic','rotation-person',now(),now()+interval '30 minutes',100,$1,'rotation-clinician','fixture-visit-intent','fixture')",[cipher('visit:rotation-visit')])
  await db.query("INSERT INTO clinic.calendar_blocks(id,doctor_id,starts_at,ends_at,encrypted_reason,request_key,request_hash) VALUES('rotation-block','doctor',now(),now()+interval '30 minutes',$1,'fixture-block-intent','fixture')",[cipher('block:rotation-block')])
  await db.query("INSERT INTO clinic.workspace_reminders(id,doctor_id,due_at,encrypted_body,request_key,request_hash) VALUES('rotation-reminder','doctor',now(),$1,'fixture-reminder-intent','fixture')",[cipher('reminder:rotation-reminder')])
  await db.query("INSERT INTO clinic.workspace_preferences(doctor_id,encrypted_body) VALUES('doctor',$1)",[cipher('workspace:doctor')])
  await db.query("INSERT INTO clinic.workspace_catalogue(id,doctor_id,kind,label,encrypted_body) VALUES('rotation-catalogue','doctor','NOTE','Fixture',$1)",[cipher('catalogue:rotation-catalogue')])
  await db.query("INSERT INTO clinic.workspace_expenses(id,doctor_id,spent_on,category,amount_paise,encrypted_body,request_key,request_hash) VALUES('rotation-expense','doctor',current_date,'Other',100,$1,'fixture-expense-intent','fixture')",[cipher('expense:rotation-expense')])
  await db.query("INSERT INTO clinic.staff_requests(id,doctor_id,clinic_id,encrypted_body,requested_role,request_key,request_hash) VALUES('rotation-staff','doctor','clinic',$1,'receptionist','fixture-staff-intent','fixture')",[cipher('staff-request:rotation-staff')])
  await db.query("INSERT INTO clinic.marketing_campaigns(id,doctor_id,title,body,budget_paise,starts_on,ends_on) VALUES('rotation-campaign','doctor','Fixture','{}',100,current_date,current_date)")
  await db.query("INSERT INTO clinic.campaign_funding_orders(id,doctor_id,campaign_id,campaign_revision,amount_paise,payment_session_encrypted,request_key) VALUES('rotation-funding','doctor','rotation-campaign',0,100,$1,'fixture-funding-intent')",[cipher('funding:rotation-funding')])
  await db.close();db=null
  const ring=JSON.stringify({next:'2'.repeat(64)}),result=await run(process.execPath,['--import','tsx',path.join(root,'scripts/rotate-encryption.ts'),'--execute'],{cwd:directory,env:{...process.env,DATABASE_URL:'',DATA_ENCRYPTION_ACTIVE_ID:'next',DATA_ENCRYPTION_KEYRING:ring},timeout:120000})
  assert.ok(result.stdout.includes('"databaseEnvelopes":9'));assert.ok(result.stdout.includes('Rotation completed.'))
  process.env.DATA_ENCRYPTION_KEYRING=ring;db=await createDatabase(undefined,path.join(directory,'.data','pg'))
  for(const [table,column,key,id,context] of [['clinic.people','encrypted_identity','id','rotation-person','person:rotation-person'],['clinic.scheduled_visits','encrypted_details','id','rotation-visit','visit:rotation-visit'],['clinic.calendar_blocks','encrypted_reason','id','rotation-block','block:rotation-block'],['clinic.workspace_reminders','encrypted_body','id','rotation-reminder','reminder:rotation-reminder'],['clinic.workspace_preferences','encrypted_body','doctor_id','doctor','workspace:doctor'],['clinic.workspace_catalogue','encrypted_body','id','rotation-catalogue','catalogue:rotation-catalogue'],['clinic.workspace_expenses','encrypted_body','id','rotation-expense','expense:rotation-expense'],['clinic.staff_requests','encrypted_body','id','rotation-staff','staff-request:rotation-staff'],['clinic.campaign_funding_orders','payment_session_encrypted','id','rotation-funding','funding:rotation-funding']]){const row=await db.one('SELECT '+column+' value FROM '+table+' WHERE '+key+'=$1',[id]);assert.ok(row.value.startsWith('v3:next:'));assert.equal(secrets.decryptSecret(row.value,context),'fictional private value')}
 }finally{await db?.close();for(const key of Object.keys(process.env))if(!(key in original))delete process.env[key];Object.assign(process.env,original);await rm(directory,{recursive:true,force:true})}
})
