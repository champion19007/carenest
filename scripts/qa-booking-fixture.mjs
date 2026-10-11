/** Local-only, synthetic QA records. Run with CareNest stopped. Never touches real bookings. */
import {createDatabase} from '../lib/db/adapters.ts'
import {applyMigrations} from '../lib/db/migrations.ts'
import {assertLocalStopped} from './local-lock.mjs'
process.env.CARENEST_LOCAL_MODE='1'
await assertLocalStopped()
const db=await createDatabase()
try{
 await applyMigrations(db)
 if(process.argv.includes('--completion-clock')){
  const b=await db.one("SELECT b.id,b.slot_id FROM patient.bookings b WHERE b.user_id='qa_payment_patient' AND b.doctor_id='qa_payment_doctor' AND b.status='confirmed' AND b.payment_required ORDER BY b.created_at DESC LIMIT 1")
  if(!b)throw new Error('No confirmed synthetic QA booking to advance')
  await db.transaction(async tx=>{
   await tx.query("UPDATE provider.appointment_slots SET slot_start=now()-interval '35 minutes',slot_end=now()-interval '5 minutes' WHERE slot_id=$1 AND doctor_id='qa_payment_doctor' AND reserved_booking_id=$2",[b.slot_id,b.id])
   await tx.query("UPDATE patient.bookings SET starts_at=now()-interval '35 minutes',ends_at=now()-interval '5 minutes' WHERE id=$1 AND user_id='qa_payment_patient' AND doctor_id='qa_payment_doctor'",[b.id])
  })
  console.log('Advanced only the synthetic QA consultation clock for completion testing.')
 }else{
  await db.query("INSERT INTO patient.users(id,phone,name,role,kyc_level) VALUES('qa_payment_patient','9000000901','QA Sandbox Patient','patient','unverified'),('qa_payment_clinician','9000000902','QA Sandbox Doctor','doctor','verified') ON CONFLICT(id) DO NOTHING")
  await db.query("INSERT INTO clinic.clinics(id,name) VALUES('qa_payment_clinic','QA Sandbox Clinic') ON CONFLICT DO NOTHING")
  await db.query("INSERT INTO provider.doctors(id,user_id,slug,name,speciality,qualification,experience,fee,status,clinic,locality,city,clinic_id,is_demo,verified_at) VALUES('qa_payment_doctor','qa_payment_clinician','qa-sandbox-payment-doctor','QA Sandbox Doctor','General Physician','Synthetic test profile',5,100,'ACTIVE','QA Sandbox Clinic','Test locality','Mumbai','qa_payment_clinic',true,now()) ON CONFLICT(id) DO NOTHING")
  for(let i=1;i<=3;i++)await db.query("INSERT INTO provider.appointment_slots(slot_id,doctor_id,slot_start,slot_end) VALUES($1,'qa_payment_doctor',now()+($2::int*interval '1 hour'),now()+($2::int*interval '1 hour')+interval '30 minutes') ON CONFLICT DO NOTHING",['qa_payment_slot_'+Date.now()+'_'+i,i])
  console.log('Created labelled synthetic patient, doctor, clinic and three QA slots; no real patient data.')
 }
}finally{await db.close()}
