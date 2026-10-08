'use server'
import {requireUser,currentAdmin} from '@/lib/auth'
import {requestIntegrationCase,reviewIntegrationCase} from '@/lib/domain/integration-cases'
import {DomainError} from '@/lib/domain/errors'
import {revalidatePath} from 'next/cache'
export type IntegrationState={error?:string;notice?:string}
const text=(f:FormData,k:string)=>String(f.get(k)??'')
export async function requestPartnerCase(_s:IntegrationState,f:FormData):Promise<IntegrationState>{const u=await requireUser('/account/integrations');try{await requestIntegrationCase(u.id,{provider:text(f,'provider'),bookingId:text(f,'bookingId')||undefined,detail:text(f,'detail'),reference:text(f,'reference'),key:text(f,'key'),consent:f.get('consent')==='on'});revalidatePath('/account/integrations');return {notice:'Private intake recorded. No partner is connected; this is not an insurance, finance or government approval.'}}catch(e){if(e instanceof DomainError)return {error:e.message};throw e}}
export async function reviewPartnerCase(_s:IntegrationState,f:FormData):Promise<IntegrationState>{const a=await currentAdmin();if(!a)return {error:'MFA administrator required.'};try{await reviewIntegrationCase(a.id,text(f,'id'),Number(text(f,'revision')),text(f,'next'),text(f,'evidence'));revalidatePath('/admin/setup');return {notice:'Intake review recorded. Live fulfilment still requires an authorized partner.'}}catch(e){if(e instanceof DomainError)return {error:e.message};throw e}}
