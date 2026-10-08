'use server'
import {requireUser} from '@/lib/auth'
import {saveNotificationPreferences} from '@/lib/domain/notification-preferences'
import {DomainError} from '@/lib/domain/errors'
import {revalidatePath} from 'next/cache'
export async function setNotificationPreferences(_s:{error?:string;notice?:string},f:FormData):Promise<{error?:string;notice?:string}>{const u=await requireUser('/account/notifications');try{await saveNotificationPreferences(u.id,f.get('email')==='on',f.get('sms')==='on',f.get('reminders')==='on');revalidatePath('/account/notifications');return {notice:'Preferences saved. Live delivery requires configured provider accounts.'}}catch(e){if(e instanceof DomainError)return {error:e.message};throw e}}
