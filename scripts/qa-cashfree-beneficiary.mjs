/** Cashfree sandbox test data only. Run with CareNest stopped, then start it again. */
import {createRequire} from 'node:module'
import {createDatabase} from '../lib/db/adapters.ts'
import {applyMigrations} from '../lib/db/migrations.ts'
import {assertLocalStopped} from './local-lock.mjs'
import {loadServices} from '../tests/service-loader.mjs'
const require=createRequire(import.meta.url)
require('@next/env').loadEnvConfig(process.cwd())
process.env.CARENEST_LOCAL_MODE='1'
await assertLocalStopped()
if(process.env.CASHFREE_ENV!=='sandbox')throw new Error('Sandbox configuration is required')
const db=await createDatabase()
try{
 await applyMigrations(db)
 if(!await db.one("SELECT id FROM provider.doctors WHERE id='qa_payment_doctor' AND user_id='qa_payment_clinician' AND name='QA Sandbox Doctor' AND is_demo=true"))throw new Error('Run the synthetic QA fixture first')
 const admin=await db.one('SELECT id FROM admins WHERE totp_secret IS NOT NULL ORDER BY created_at LIMIT 1')
 if(!admin)throw new Error('Set up a local administrator with two-factor authentication before linking beneficiaries')
 const load=loadServices(db),api=load('lib/cashfree-payouts.ts'),id='CARENEST_QA_DOCTOR'
 let beneficiary
 try{beneficiary=await api.verifiedBeneficiary(id)}catch(error){
  if(error.code!=='PAYOUT_NOT_FOUND')throw error
  await api.payoutRequest('beneficiary','POST',{beneficiary_id:id,beneficiary_name:'QA Sandbox Doctor',beneficiary_instrument_details:{bank_account_number:'026291800001191',bank_ifsc:'YESB0000262'}})
  beneficiary=await api.verifiedBeneficiary(id)
 }
 if(beneficiary.beneficiary_instrument_details?.bank_account_number!=='026291800001191'||beneficiary.beneficiary_instrument_details?.bank_ifsc!=='YESB0000262')throw new Error('The QA beneficiary must match Cashfree’s published test bank details')
 await load('lib/domain/doctor-payouts.ts').bindDoctorBeneficiary(admin.id,'qa_payment_doctor',id,true)
 console.log('Verified Cashfree test beneficiary linked only to the synthetic QA doctor. Restart CareNest to process its completed paid consultation.')
}catch(error){console.error(error.code??'QA_SETUP',error.message);process.exitCode=1}finally{await db.close()}
