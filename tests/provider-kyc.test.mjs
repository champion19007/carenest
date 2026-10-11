import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {mkdir,readdir,unlink,rmdir} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import sharp from 'sharp'
import {freshDb,addUser,addDoctor,addArea} from './helpers.mjs'
import {loadServices} from './service-loader.mjs'
import {missingKycEvidence} from '../lib/kyc.ts'
import {parseProviderDraft,validateKycReview} from '../lib/domain/provider-validation.ts'
import {consolidateDemoCatalogue} from '../lib/db/demo-catalogue.ts'

const draft={name:'Synthetic test practitioner',kind:'human',speciality:'General Physician',qualification:'Synthetic qualification',registration:'TEST REG 01',council:'Test council',clinic:'Synthetic clinic',address:'Synthetic address',city:'Mumbai',pin:'400001',fee:600,experience:5,languages:'English',supportedSpecies:[]}
const checks=revision=>({revision,identityMatched:true,registrationChecked:true,qualificationMatched:true,clinicMatched:true,sourceUrl:'https://nmr.nmc.org.in/search-doctor',sourceReference:'Synthetic isolated test lookup; no government verification'})
test('KYC input rules reject incomplete checks, bad sources and unsupported provider values',()=>{
 assert.equal(missingKycEvidence([{evidence_kind:'IDENTITY',state:'CLEAN'}]).length,3)
 assert.equal(missingKycEvidence([{evidence_kind:'IDENTITY',state:'QUARANTINED'}]).length,4)
 assert.equal(missingKycEvidence([{evidence_kind:'IDENTITY',state:'QUARANTINED'},{evidence_kind:'IDENTITY',state:'CLEAN'}]).length,4)
 assert.throws(()=>parseProviderDraft({...draft,pin:'000001'}),e=>e.code==='VALIDATION')
 assert.throws(()=>parseProviderDraft({...draft,fee:1.5}),e=>e.code==='VALIDATION')
 assert.throws(()=>parseProviderDraft({...draft,kind:'vet',supportedSpecies:[]}),e=>e.code==='VALIDATION')
 assert.deepEqual(parseProviderDraft({...draft,kind:'vet',supportedSpecies:['cattle','fish','cattle']}).supportedSpecies,['cattle','fish'])
 for(const key of ['identityMatched','registrationChecked','qualificationMatched','clinicMatched'])assert.throws(()=>validateKycReview('APPROVED','Synthetic review reason',{...checks(1),[key]:false}),e=>e.code==='VERIFICATION')
 assert.throws(()=>validateKycReview('APPROVED','Synthetic review reason',{...checks(1),sourceUrl:'javascript:alert(1)'}),e=>e.code==='VERIFICATION_SOURCE')
 assert.throws(()=>validateKycReview('APPROVED','Synthetic review reason',{...checks(1),sourceReference:''}),e=>e.code==='VALIDATION')
})

test('KYC uploads, consent, evidence snapshots and publication remain owned and atomic',async t=>{
 const env={...process.env},db=await freshDb(),root=path.resolve('.data','qa-kyc-'+randomUUID())
 await mkdir(root,{recursive:true});Object.assign(process.env,{CARENEST_LOCAL_MODE:'1',PRIVATE_FILE_ROOT:root,AUTH_SECRET:'kyc-fixture-'.repeat(5)});delete process.env.CLAMSCAN_PATH
 const load=loadServices(db),providers=load('lib/domain/providers.ts'),files=load('lib/domain/files.ts')
 const image=await sharp({create:{width:12,height:12,channels:3,background:'#387fbb'}}).png().toBuffer()
 let id,revision,proofs=[]
 const uploadSet=async(actor,application)=>{const list=[];for(const kind of ['IDENTITY','REGISTRATION','QUALIFICATION','CLINIC'])list.push(await files.uploadPrivateFile(actor,'Synthetic '+kind+'.png',image,{applicationId:application,evidenceKind:kind}));return list}
 try{
  await addUser(db,'applicant','9000000001');await addUser(db,'other','9000000002');await addUser(db,'duplicate','9000000003')
  await db.query("INSERT INTO admins(id,username,password_hash,salt,totp_secret) VALUES('admin','fixture-admin','unused','unused','fixture-mfa')")
  id=await providers.saveProviderApplication('applicant',draft)
  await t.test('one attachment cannot submit and foreign uploads cannot add evidence',async()=>{
   await files.uploadPrivateFile('applicant','Synthetic identity.png',image,{applicationId:id,evidenceKind:'IDENTITY'})
   await assert.rejects(providers.submitProviderApplication('applicant',id,true),e=>e.code==='EVIDENCE')
   await assert.rejects(files.uploadPrivateFile('other','Synthetic identity.png',image,{applicationId:id,evidenceKind:'IDENTITY'}),e=>e.code==='FORBIDDEN')
   await assert.rejects(files.uploadPrivateFile('applicant','Synthetic identity.png',image,{applicationId:id,evidenceKind:'OTHER'}),e=>e.code==='VALIDATION')
  })
  await t.test('safe images are encrypted; unscanned PDF evidence remains quarantined',async()=>{
   const pdf=await files.uploadPrivateFile('applicant','Synthetic registration.pdf',Buffer.from('%PDF-1.4\nSynthetic fixture'),{applicationId:id,evidenceKind:'REGISTRATION'});assert.equal(pdf.state,'QUARANTINED')
   await assert.rejects(files.downloadPrivateFile('applicant',null,pdf.id),e=>e.code==='QUARANTINED')
   proofs=await uploadSet('applicant',id)
   const own=await files.downloadPrivateFile('applicant',null,proofs[0].id);assert.ok(own.bytes.length>0)
   await assert.rejects(files.downloadPrivateFile('other',null,proofs[0].id),e=>e.code==='FORBIDDEN')
  })
  await t.test('submission needs consent and the current revision, then freezes the exact four clean documents',async()=>{
   await assert.rejects(providers.submitProviderApplication('applicant',id,false),e=>e.code==='CONSENT')
   await assert.rejects(providers.submitProviderApplication('applicant',id,true,99),e=>e.code==='REVISION')
   await providers.submitProviderApplication('applicant',id,true,0)
   const application=await db.one('SELECT * FROM provider.applications WHERE id=$1',[id]);revision=application.revision
   assert.equal(application.status,'SUBMITTED');assert.ok(application.consent_at);assert.equal(Object.keys(application.evidence_snapshot).length,4)
   await assert.rejects(files.uploadPrivateFile('applicant','Replacement.png',image,{applicationId:id,evidenceKind:'IDENTITY'}),e=>e.code==='KYC_STATE')
   await assert.rejects(providers.saveProviderApplication('applicant',draft),e=>e.code==='SUBMITTED')
  })
  await t.test('approval requires authorised fresh review and unchanged clean evidence',async()=>{
   await assert.rejects(providers.reviewProviderApplication('other',id,'APPROVED','Synthetic review reason',checks(revision)),e=>e.code==='FORBIDDEN')
   await assert.rejects(providers.reviewProviderApplication('admin',id,'APPROVED','Synthetic review reason',checks(revision-1)),e=>e.code==='REVISION')
   const selected=(await db.one('SELECT evidence_snapshot FROM provider.applications WHERE id=$1',[id])).evidence_snapshot.IDENTITY
   await db.query("UPDATE private_files SET state='QUARANTINED' WHERE id=$1",[selected])
   await assert.rejects(providers.reviewProviderApplication('admin',id,'APPROVED','Synthetic review reason',checks(revision)),e=>e.code==='EVIDENCE')
   await db.query("UPDATE private_files SET state='CLEAN' WHERE id=$1",[selected])
  })
  await t.test('review/audit failure rolls back publication, clinic, role and verification status',async()=>{
   const failing={...db,transaction:work=>db.transaction(tx=>work({...tx,query:(sql,args)=>sql.startsWith('INSERT INTO provider.kyc_reviews')?Promise.reject(new Error('Review journal unavailable')):tx.query(sql,args)}))}
   await assert.rejects(loadServices(failing)('lib/domain/providers.ts').reviewProviderApplication('admin',id,'APPROVED','Synthetic review reason',checks(revision)),/Review journal/)
   assert.equal((await db.one("SELECT role FROM patient.users WHERE id='applicant'")).role,'patient');assert.equal(Number((await db.one('SELECT count(*) n FROM provider.doctors')).n),0)
   assert.equal((await db.one('SELECT status FROM provider.applications WHERE id=$1',[id])).status,'SUBMITTED')
  })
  await t.test('approval creates a real-profile record and one complete review; replay cannot create another',async()=>{
   await addArea(db,'400001','Synthetic clinic locality','Mumbai')
   await providers.reviewProviderApplication('admin',id,'APPROVED','Synthetic isolated test approval',checks(revision))
   const doctor=await db.one("SELECT * FROM provider.doctors WHERE user_id='applicant'");assert.equal(doctor.is_demo,false);assert.ok(doctor.verified_at);assert.ok(doctor.locality_id);assert.equal(doctor.locality,'Synthetic clinic locality')
   const account=await db.one("SELECT role,kyc_level FROM patient.users WHERE id='applicant'");assert.equal(account.role,'doctor');assert.equal(account.kyc_level,'verified')
   const review=await db.one('SELECT * FROM provider.kyc_reviews WHERE application_id=$1',[id]);assert.equal(review.reviewer_id,'admin');assert.equal(Object.keys(review.evidence_snapshot).length,4)
   await assert.rejects(providers.reviewProviderApplication('admin',id,'APPROVED','Synthetic repeated approval',checks(revision)),e=>e.code==='STATE')
  })
  await t.test('request-changes/resubmission resets consent and never grants doctor access',async()=>{
   const other=await providers.saveProviderApplication('other',{...draft,name:'Synthetic other practitioner',registration:'OTHER-REG'})
   await uploadSet('other',other);await providers.submitProviderApplication('other',other,true)
   let r=(await providers.providerApplication('other')).revision
   await providers.reviewProviderApplication('admin',other,'NEEDS_CHANGES','Synthetic clarification needed',{...checks(r),identityMatched:false})
   assert.equal((await db.one("SELECT role FROM patient.users WHERE id='other'")).role,'patient')
   await providers.saveProviderApplication('other',{...draft,name:'Synthetic other practitioner',registration:'OTHER-REG'})
   const application=await db.one('SELECT * FROM provider.applications WHERE id=$1',[other]);assert.equal(application.consent_at,null);assert.equal(application.evidence_snapshot,null)
   await providers.submitProviderApplication('other',other,true,application.revision);r=(await providers.providerApplication('other')).revision
   await providers.reviewProviderApplication('admin',other,'REJECTED','Synthetic insufficient professional evidence',checks(r));assert.equal((await providers.providerApplication('other')).status,'REJECTED')
  })
  await t.test('normalised duplicate council registration cannot publish a second account',async()=>{
   const duplicate=await providers.saveProviderApplication('duplicate',{...draft,name:'Synthetic duplicate applicant',registration:'testreg01',council:'test council'})
   await uploadSet('duplicate',duplicate);await providers.submitProviderApplication('duplicate',duplicate,true)
   await assert.rejects(providers.reviewProviderApplication('admin',duplicate,'APPROVED','Synthetic duplicate review',checks((await providers.providerApplication('duplicate')).revision)),e=>e.code==='REGISTRATION_DUPLICATE')
  })
  await t.test('demo consolidation keeps one specialty fixture, preserves real profiles and appointment history, and is repeatable',async()=>{
   for(const demo of ['sample-a','sample-b']){await addDoctor(db,demo);await db.query('UPDATE provider.doctors SET is_demo=true WHERE id=$1',[demo])}
   await db.query("INSERT INTO patient.bookings(id,user_id,doctor_id,kind,slot,status) VALUES('retained-demo-visit','other','sample-b','clinic','Synthetic past visit','attended')")
   const result=await consolidateDemoCatalogue(db);assert.equal(result.archived,1);assert.equal((await db.one("SELECT status FROM provider.doctors WHERE id='sample-b'")).status,'SUSPENDED')
   assert.equal((await db.one("SELECT doctor_id FROM patient.bookings WHERE id='retained-demo-visit'")).doctor_id,'sample-b')
   assert.equal((await db.one("SELECT status FROM provider.doctors WHERE user_id='applicant'")).status,'ACTIVE');assert.equal((await consolidateDemoCatalogue(db)).archived,0)
  })
  await t.test('cattle and fish pet profiles are accepted consistently by the domain and database',async()=>{
   const pets=load('lib/domain/pets.ts');for(const species of ['cattle','fish'])await pets.savePet('other',{name:'Synthetic '+species,species,breed:'',sex:'unknown'})
   assert.deepEqual((await pets.ownedPets('other')).map(p=>p.species).sort(),['cattle','fish'])
  })
 }finally{
  await db.close();for(const file of await readdir(root))await unlink(path.join(root,file));await rmdir(root)
  for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env)
 }
})
