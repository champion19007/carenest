'use server'
import {requireUser} from '@/lib/auth'
import {saveNotificationPreferences} from '@/lib/domain/notification-preferences'
import {DomainError} from '@/lib/domain/errors'
import {revalidatePath} from 'next/cache'
import {refreshWhatsAppStatus,whatsappReady} from '@/lib/whatsapp'
import {fast2smsSelected,fast2smsReady} from '@/lib/fast2sms'
import {consumeLimits} from '@/lib/domain/rate-limit'
import {notificationPreferences} from '@/lib/domain/notification-preferences'
import {emit} from '@/lib/db/outbox'
import {randomUUID} from 'node:crypto'
import {emailConfigured} from '@/lib/email'
import {metaWhatsAppSelected,assertMetaWhatsAppTestReady} from '@/lib/meta-whatsapp'
type MessageState={error?:string;notice?:string}
export async function requestEmailTest(_s:MessageState):Promise<MessageState>{
 const user=await requireUser('/account/notifications')
 try{
  if(!(await notificationPreferences(user.id)).email_enabled||!user.email_verified_at)return {error:'Connect Google and enable email updates first.'}
  if(!emailConfigured())return {error:'The email sender is not configured yet.'}
  const limit=await consumeLimits([{bucket:'email-test',key:user.id,limit:2,seconds:3600}]);if(!limit.allowed)return {error:'Please wait before sending another email test.'}
  await emit({kind:'account.email_test_requested',subjectId:user.id,payload:{userId:user.id},eventKey:'email-test:'+randomUUID()})
  revalidatePath('/account/notifications');return {notice:'Test email queued. Keep CareNest running and check your inbox.'}
 }catch(error){if(error instanceof DomainError)return {error:error.message};throw error}
}
export async function setNotificationPreferences(_s:MessageState,f:FormData):Promise<MessageState>{const u=await requireUser('/account/notifications');try{await saveNotificationPreferences(u.id,f.get('email')==='on',f.get('sms')==='on',f.get('reminders')==='on',f.get('whatsapp')==='on');revalidatePath('/account/notifications');return {notice:'Preferences saved. SMS and WhatsApp updates need configured delivery and your opt-in.'}}catch(e){if(e instanceof DomainError)return {error:e.message};throw e}}
export async function requestWhatsAppTest(_s:MessageState):Promise<MessageState>{const u=await requireUser('/account/notifications');try{
 const preferences=await notificationPreferences(u.id)
 if(!metaWhatsAppSelected()&&fast2smsSelected()){
  if(!preferences.sms_enabled&&!preferences.whatsapp_enabled)return {error:'Enable and save at least one phone update channel first.'}
  if((preferences.sms_enabled&&!fast2smsReady('sms','UPDATE'))||(preferences.whatsapp_enabled&&!fast2smsReady('whatsapp','UPDATE')))return {error:'Approve and configure the templates for your selected update channels first.'}
 }else{
  if(!preferences.whatsapp_enabled)return {error:'Enable and save WhatsApp updates first.'}
  if(!whatsappReady())return {error:'Approve and configure the WhatsApp update template before sending a phone test.'}
  if(metaWhatsAppSelected())await assertMetaWhatsAppTestReady()
 }
 const limit=await consumeLimits([{bucket:'whatsapp-test',key:u.id,limit:3,seconds:3600}]);if(!limit.allowed)return {error:'Test-message limit reached. Try later.'};await emit({kind:'account.update_requested',subjectId:u.id,payload:{userId:u.id},eventKey:'whatsapp-test:'+randomUUID()});revalidatePath('/account/notifications');return {notice:'Test update queued. Keep the worker running; check the phone and provider acceptance receipt below.'}}catch(e){if(e instanceof DomainError)return {error:e.message};throw e}}
export async function checkWhatsAppReceipt(_s:MessageState,f:FormData):Promise<MessageState>{const u=await requireUser('/account/notifications');try{if(metaWhatsAppSelected())return {error:'Meta acceptance receipts are shown in your updates. Check your phone for actual delivery; signed Meta delivery webhooks are not configured.'};if(fast2smsSelected())return {error:'Fast2SMS acceptance receipts are shown in your updates. Actual delivery must be checked on your test phone.'};const limit=await consumeLimits([{bucket:'whatsapp-receipt',key:u.id,limit:10,seconds:60}]);if(!limit.allowed)return {error:'Please wait before checking again.'};const state=await refreshWhatsAppStatus(u.id,String(f.get('id')??''));revalidatePath('/account/notifications');return {notice:'Provider status: '+state+'.'}}catch(e){if(e instanceof DomainError)return {error:e.message};throw e}}
