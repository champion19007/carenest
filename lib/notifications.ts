import 'server-only'
import {getDb} from './db/client'
import {localMode} from './secrets'
import {smsIsLive,sendTransactionalSms} from './sms'
import {DomainError} from './domain/errors'
import {notificationPreferences} from './domain/notification-preferences'
import {sendWhatsAppUpdate} from './whatsapp'
import {fast2smsSelected,sendFast2smsUpdates} from './fast2sms'
import {sendEmailUpdate} from './email'
import {updateMessage} from './domain/appointment-notifications'
import {metaWhatsAppSelected,sendMetaWhatsAppUpdate} from './meta-whatsapp'

async function legacySmsUpdate(userId:string,eventId:string){
 if(localMode()||!smsIsLive()||!(await notificationPreferences(userId)).sms_enabled)return
 const user=await getDb().one<{phone:string|null}>("SELECT phone FROM patient.users WHERE id=$1 AND status='ACTIVE'",[userId]);if(!user?.phone)return
 const message=await updateMessage(userId,eventId);if(!message)return
 const key='event:'+eventId+':sms',prior=await getDb().one<{state:string}>('SELECT state FROM notification_delivery WHERE effect_key=$1',[key])
 if(prior){if(['ACCEPTED','DELIVERED'].includes(prior.state))return;throw new DomainError('DELIVERY_UNKNOWN','An earlier SMS outcome needs review.',503)}
 const claim=await getDb().one("INSERT INTO notification_delivery(effect_key,channel,state,user_id) VALUES($1,'sms','SENDING',$2) ON CONFLICT DO NOTHING RETURNING effect_key",[key,userId]);if(!claim)return
 try{const ref=await sendTransactionalSms(user.phone,message.text);await getDb().query("UPDATE notification_delivery SET state='ACCEPTED',provider_ref=$2,updated_at=now() WHERE effect_key=$1",[key,ref])}
 catch{await getDb().query("UPDATE notification_delivery SET state='UNKNOWN',error_code='DELIVERY_UNKNOWN',updated_at=now() WHERE effect_key=$1",[key]);throw new DomainError('DELIVERY_UNKNOWN','SMS outcome needs review.',503)}
}
export async function sendExternalUpdate(userId:string,eventId:string){
 const event=await getDb().one<{kind:string}>('SELECT kind FROM domain_events WHERE id=$1',[eventId])
 if(event?.kind==='booking.requested')return // An unpaid/requested hold is not a scheduled visit.
 if(event?.kind==='account.email_test_requested'){await sendEmailUpdate(userId,eventId);return}
 // A WhatsApp failure cannot suppress an opted-in booking email, or vice versa.
 const meta=metaWhatsAppSelected(),fast=!meta&&fast2smsSelected()
 const results=await Promise.allSettled([meta?sendMetaWhatsAppUpdate(userId,eventId):fast?sendFast2smsUpdates(userId,eventId):sendWhatsAppUpdate(userId,eventId),sendEmailUpdate(userId,eventId),...(fast||meta?[]:[legacySmsUpdate(userId,eventId)])])
 const failure=results.find(r=>r.status==='rejected');if(failure?.status==='rejected')throw failure.reason
}
