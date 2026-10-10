import 'server-only'
import {getDb,ensureSchema} from '@/lib/db/client'
import {sweepAppointmentHolds} from './bookings'
import {ensureSlots} from '@/lib/db/slots'
import {drainAll} from '@/lib/drain'
import {reconcileLivekit} from './livekit'
import {runDoctorPayouts} from './doctor-payouts'
import {reconcileAppointmentPayment} from './billing'
import {scheduleAppointmentReminders} from './appointment-notifications'
export async function runLocalWork(batch=20){
 const deadline=Date.now()+45000
 await ensureSchema();const paymentsReconciled=await reconcileAppointmentPayment(),expired=await sweepAppointmentHolds(100)
 const claimed=await getDb().one(`INSERT INTO maintenance_state(name,last_run) VALUES('calendar',now()) ON CONFLICT(name) DO UPDATE SET last_run=now() WHERE maintenance_state.last_run<now()-interval '1 hour' RETURNING name`)
 if(claimed){const doctors=await getDb().query<{id:string}>("SELECT id FROM provider.doctors WHERE status='ACTIVE' ORDER BY id LIMIT 1000");for(const doctor of doctors)await ensureSlots(doctor.id)}
 const due=await getDb().query<{id:string;owner_id:string}>(`SELECT v.id,p.owner_id FROM patient.pet_vaccinations v JOIN patient.pets p ON p.id=v.pet_id JOIN patient.users u ON u.id=p.owner_id LEFT JOIN patient.notification_preferences pref ON pref.user_id=p.owner_id WHERE v.due_on <= (now() AT TIME ZONE 'Asia/Kolkata')::date+7 AND v.due_on >= (now() AT TIME ZONE 'Asia/Kolkata')::date AND v.reminder_sent=false AND p.archived_at IS NULL AND u.status='ACTIVE' AND coalesce(pref.reminders_enabled,true) LIMIT 100`)
 for(const item of due)await getDb().transaction(async tx=>{const marked=await tx.one('UPDATE patient.pet_vaccinations SET reminder_sent=true WHERE id=$1 AND reminder_sent=false RETURNING id',[item.id]);if(marked)await tx.query("INSERT INTO domain_events(kind,subject_id,payload,event_key) VALUES('pet.vaccine_due',$1,$2::jsonb,$3) ON CONFLICT DO NOTHING",[item.id,JSON.stringify({userId:item.owner_id}),'vaccine:'+item.id])})
 await getDb().query('DELETE FROM worker_runs WHERE expires_at<now()')
 await getDb().query('DELETE FROM mobile_pairings WHERE expires_at<now()')
 await getDb().query("DELETE FROM phone_verifications WHERE expires_at<now()-interval '1 day'")
 await getDb().query("DELETE FROM mobile_sync_intents WHERE created_at<now()-interval '30 days'")
 const remindersScheduled=await scheduleAppointmentReminders()
 const drained=await drainAll(batch,deadline-18000);let videoFence='disabled'
 try{const result=await reconcileLivekit();videoFence='checked '+result.checked}catch{videoFence='retry required';await getDb().transaction(async tx=>{const log=await tx.one("INSERT INTO maintenance_state(name,last_run) VALUES('livekit-fence-error',now()) ON CONFLICT(name) DO UPDATE SET last_run=now() WHERE maintenance_state.last_run<now()-interval '1 minute' RETURNING name");if(log)await tx.query("INSERT INTO audit_log(action,resource) VALUES('livekit:fence_failed','local-worker')")})}
 const payouts=await runDoctorPayouts(Date.now()<deadline-17000?1:0)
 return {expired,...drained,videoFence,payouts,paymentsReconciled,remindersScheduled}
}
