import 'server-only'
import {ensureSchema,getDb} from '@/lib/db/client'
import {localMode} from '@/lib/secrets'
import {notificationPreferences} from './notification-preferences'
import {reject} from './errors'
import {decimalRupees} from '@/lib/money'

export type UpdateMessage={title:string;text:string;reference:string;appointment?:{doctor:string;date:string;time:string;mode:string;url:string};transaction?:{status:string;amount:string;url:string};reminder:boolean}
const clean=(value:string,max=100)=>value.replace(/[|\r\n\u0000-\u001f]/g,' ').trim().slice(0,max)
function appOrigin(){
 const origin=new URL(process.env.APP_URL??process.env.APP_ORIGIN??'http://localhost:3000')
 if(origin.username||origin.password||origin.search||origin.hash||!(origin.protocol==='https:'||localMode()&&origin.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(origin.hostname)))reject('APP_ORIGIN','Configure a trusted application URL before sending appointment links.',503)
 return origin.origin
}
export async function scheduleAppointmentReminders(limit=100){
 await ensureSchema()
 const events=await getDb().query(`INSERT INTO domain_events(kind,subject_id,payload,event_key,available_at)
 SELECT 'booking.reminder_due',b.id,jsonb_build_object('userId',b.user_id,'revision',b.revision),
 'booking:'||b.id||':'||b.revision||':reminder:10min',greatest(now(),b.starts_at-interval '10 minutes')
 FROM patient.bookings b JOIN patient.users u ON u.id=b.user_id
 LEFT JOIN patient.notification_preferences p ON p.user_id=b.user_id
 WHERE b.status='confirmed' AND b.started_at IS NULL AND b.starts_at>now() AND u.status='ACTIVE'
 AND coalesce(p.reminders_enabled,true)
 AND (NOT b.payment_required OR EXISTS(SELECT 1 FROM clinic.invoices i WHERE i.booking_id=b.id AND i.state='PAID'))
 AND NOT EXISTS(SELECT 1 FROM domain_events e WHERE e.event_key='booking:'||b.id||':'||b.revision||':reminder:10min')
 ORDER BY b.starts_at,b.id LIMIT $1 ON CONFLICT DO NOTHING RETURNING id`,[Math.min(100,Math.max(1,limit))])
 return events.length
}
export async function updateMessage(userId:string,eventId:string):Promise<UpdateMessage|null>{
 await ensureSchema()
 const event=await getDb().one<{kind:string;subject_id:string|null;event_key:string|null;payload:Record<string,unknown>}>('SELECT kind,subject_id,payload,event_key FROM domain_events WHERE id=$1',[eventId])
 if(!event||event.payload.userId!==userId)reject('RECIPIENT','Notification ownership does not match.',403)
 const titles:Record<string,string>={'booking.requested':'Appointment awaiting confirmation','booking.confirmed':'Appointment confirmed','booking.reminder_due':'Appointment reminder','booking.cancelled':'Appointment cancelled','booking.declined':'Appointment declined','booking.expired':'Appointment expired','booking.attended':'Consultation completed','booking.no_show':'Appointment not attended','payment.recorded':'Payment status updated','payment.refunded':'Refund completed','demo.payment_completed':'Sandbox payment verified','doctor.payout_paid':'Doctor payout completed','doctor.payout_reversed':'Doctor payout reversed','account.update_requested':'Test account update','pet.vaccine_due':'Pet reminder','lab.requested':'Lab request received','lab.updated':'Lab request updated','support.updated':'Support request updated','pharmacy.updated':'Pharmacy request updated','estimate.issued':'Estimate available'}
 const title=event.kind==='account.email_test_requested'?'Test booking email':titles[event.kind];if(!title)return null
 const reference=clean(String(event.subject_id??eventId)),reminder=event.kind==='booking.reminder_due'
 if(event.kind.startsWith('booking.')){
  const b=await getDb().one<{user_id:string;revision:number;status:string;starts_at:string;ends_at:string;kind:string;name:string;started_at:string|null;future:boolean;reminder_due:boolean;payment_ok:boolean}>(`SELECT b.*,d.name,b.starts_at>clock_timestamp() future,b.starts_at-interval '10 minutes'<=clock_timestamp() reminder_due,
   (NOT b.payment_required OR EXISTS(SELECT 1 FROM clinic.invoices i WHERE i.booking_id=b.id AND i.state='PAID')) payment_ok
   FROM patient.bookings b JOIN provider.doctors d ON d.id=b.doctor_id WHERE b.id=$1`,[event.subject_id])
  if(!b||b.user_id!==userId)reject('RECIPIENT','Appointment ownership does not match.',403)
  if(event.payload.revision!==b.revision||event.kind!=='booking.reminder_due'&&b.status!==event.kind.slice(8))return null
  if(reminder&&(!b.future||!b.reminder_due||b.status!=='confirmed'||b.started_at||!b.payment_ok||!(await notificationPreferences(userId)).reminders_enabled))return null
  if(event.kind==='booking.confirmed'&&(!b.future||!b.payment_ok))return null
  const clock=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit',hour12:true})
  const appointment={doctor:clean(b.name),date:new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric'}).format(new Date(b.starts_at)),time:clock.format(new Date(b.starts_at))+' - '+clock.format(new Date(b.ends_at))+' IST',mode:b.kind==='video'?'Video consultation':b.kind==='home_visit'?'Home visit':'Clinic visit',url:appOrigin()+(b.kind==='video'?'/consult/'+encodeURIComponent(reference):'/account')}
  return {title,reference,reminder,appointment,text:`${title}.\nDoctor: ${appointment.doctor}\nDate: ${appointment.date}\nTime: ${appointment.time}\nType: ${appointment.mode}\nReference: ${reference}\n${reminder?'Your appointment starts shortly.\n':''}Open CareNest: ${appointment.url}`}
 }
 if(['payment.recorded','payment.refunded','demo.payment_completed','doctor.payout_paid','doctor.payout_reversed'].includes(event.kind)){
  const eventKey=event.event_key??''
  let row:{amount_paise:string;currency:string;status:string;reference:string}|undefined
  if(event.kind==='demo.payment_completed')row=await getDb().one("SELECT amount_paise,currency,'Sandbox payment received' status,id reference FROM demo_payment_orders WHERE id=$1 AND user_id=$2 AND state='CAPTURED'",[event.subject_id,userId])
  else if(event.kind.startsWith('doctor.payout_'))row=await getDb().one(`SELECT p.amount_paise,p.currency,CASE WHEN p.state='PAID' THEN 'Doctor payout completed' ELSE 'Doctor payout reversed' END status,p.id reference FROM doctor_payouts p JOIN provider.doctors d ON d.id=p.doctor_id WHERE p.id=$1 AND d.user_id=$2 AND p.state=$3`,[event.subject_id,userId,event.kind==='doctor.payout_paid'?'PAID':'REVERSED'])
  else if(event.kind==='payment.refunded'){
   const refund=eventKey.startsWith('refund:')&&eventKey.endsWith(':processed')?eventKey.slice(7,-10):''
   row=await getDb().one("SELECT r.amount_paise,i.currency,'Refund completed' status,r.id reference FROM refunds r JOIN payment_orders p ON p.id=r.payment_id JOIN clinic.invoices i ON i.id=p.invoice_id WHERE r.id=$1 AND i.id=$2 AND i.user_id=$3 AND r.state='PROCESSED'",[refund,event.subject_id,userId])
  }else if(eventKey.startsWith('payment:')&&eventKey.endsWith(':captured')){
   const payment=eventKey.slice(8,-9)
   row=await getDb().one("SELECT p.amount_paise,p.currency,CASE WHEN p.state='OVERPAYMENT' THEN 'Payment received; refund review required' ELSE 'Payment received' END status,p.id reference FROM payment_orders p JOIN clinic.invoices i ON i.id=p.invoice_id WHERE p.id=$1 AND i.id=$2 AND i.user_id=$3 AND p.state IN ('CAPTURED','OVERPAYMENT')",[payment,event.subject_id,userId])
  }else row=await getDb().one("SELECT total_paise amount_paise,currency,CASE WHEN state='WAIVED' THEN 'Fee waived' ELSE 'Payment received' END status,id reference FROM clinic.invoices WHERE id=$1 AND user_id=$2 AND state IN ('PAID','WAIVED')",[event.subject_id,userId])
  // A pending order or invented event must never produce a success receipt.
  if(!row)return null
  const transaction={status:row.status,amount:decimalRupees(String(row.amount_paise))+' '+clean(row.currency,3),url:appOrigin()+'/account/billing'},receipt=clean(row.reference)
  return {title:row.status,reference:receipt,transaction,reminder:false,text:`${transaction.status}.\nAmount: ${transaction.amount}\nReference: ${receipt}\nOpen CareNest: ${transaction.url}`}
 }
 return {title,reference,reminder:false,text:`${title}.\nReference: ${reference}\nOpen CareNest: ${appOrigin()}/account`}
}
