'use server'
import {requireRole,currentAdmin} from '@/lib/auth'
import {revalidatePath} from 'next/cache'
import {DomainError} from '@/lib/domain/errors'
import {registerClinicPatient,editClinicPatient} from '@/lib/domain/workspace-patients'
import {scheduleClinicVisit,rescheduleClinicVisit,changeClinicVisit,checkInClinicPatient,reissueClinicClaim} from '@/lib/domain/workspace-visits'
import {blockCalendar,cancelCalendarBlock,saveWorkspaceReminder,finishWorkspaceReminder} from '@/lib/domain/workspace-calendar'
import {saveWorkspaceSettings,saveCatalogueItem,archiveCatalogueItem,type CatalogueKind,type WorkspacePreferences} from '@/lib/domain/workspace-settings'
import {saveStockItem,receiveStock,adjustStock} from '@/lib/domain/workspace-inventory'
import {recordWorkspaceExpense,voidWorkspaceExpense} from '@/lib/domain/workspace-expenses'
import {saveCampaign,changeCampaign,reviewCampaign} from '@/lib/domain/workspace-marketing'
import {requestStaffAccess,reviewStaffAccess} from '@/lib/domain/workspace-staff'
import {workspaceTransaction} from '@/lib/domain/workspace-access'
import {registerWalkIn,transitionWalkIn} from '@/lib/domain/walk-ins'
import {createSupportCase} from '@/lib/domain/support'
export type WorkspaceState={error?:string;notice?:string;id?:string;claimToken?:string|null}
const value=(form:FormData,key:string)=>String(form.get(key)??'')
function refresh(){revalidatePath('/practice','layout');revalidatePath('/account');revalidatePath('/staff/clinic')}
async function execute(work:(actorId:string)=>Promise<string|void|{id:string;claimToken?:string|null}>,notice:string):Promise<WorkspaceState>{
 const user=await requireRole('doctor','/practice/calendar')
 try{const result=await work(user.id);refresh();return {notice,...(typeof result==='string'?{id:result}:result??{})}}
 catch(error){if(error instanceof DomainError)return {error:error.message};throw error}
}
function identity(form:FormData){return {...Object.fromEntries(['name','phone','email','dob','sex','species','guardian','reason','bloodGroup'].map(key=>[key,value(form,key)])),sex:value(form,'sex')||'Unknown',bloodGroup:value(form,'bloodGroup')||'Unknown',consent:form.get('consent')==='on'}}
function timestamp(form:FormData,date='day',time='time'){return value(form,date)+'T'+value(form,time)+':00+05:30'}
export async function addPracticePatient(_prev:WorkspaceState,form:FormData){return execute(actor=>registerClinicPatient(actor,identity(form),value(form,'requestKey')),'Clinic patient saved.')}
export async function updatePracticePatient(_prev:WorkspaceState,form:FormData){return execute(actor=>editClinicPatient(actor,value(form,'personId'),identity(form)),'Clinic contact details saved.')}
export async function addPracticeAppointment(_prev:WorkspaceState,form:FormData){return execute(actor=>scheduleClinicVisit(actor,{personId:value(form,'personId')||undefined,patient:identity(form),startsAt:timestamp(form),duration:Number(value(form,'duration')),reason:value(form,'reason'),procedures:value(form,'procedures'),requestKey:value(form,'requestKey')}),'Clinic appointment scheduled. Record physical arrival when the patient comes in.')}
export async function movePracticeAppointment(_prev:WorkspaceState,form:FormData){return execute(actor=>rescheduleClinicVisit(actor,value(form,'id'),Number(value(form,'revision')),timestamp(form),Number(value(form,'duration'))),'Appointment rescheduled.')}
export async function setPracticeVisitState(_prev:WorkspaceState,form:FormData){return execute(actor=>changeClinicVisit(actor,value(form,'id'),Number(value(form,'revision')),value(form,'next') as 'ARRIVED'|'CANCELLED'|'NO_SHOW'),'Visit status saved.')}
export async function addPracticeWalkIn(_prev:WorkspaceState,form:FormData){return execute(async actor=>{
 if(value(form,'personId'))return checkInClinicPatient(actor,value(form,'personId'),value(form,'requestKey'))
 const d=await workspaceTransaction(actor,async(_tx,doctor)=>doctor)
 return registerWalkIn(actor,{clinicId:d.clinic_id,doctorId:d.id,name:value(form,'name'),phone:value(form,'phone'),dob:value(form,'dob'),sex:value(form,'sex'),kind:d.kind==='vet'?'pet':'human',species:value(form,'species'),guardian:value(form,'guardian'),reason:value(form,'reason'),consentAttested:form.get('consent')==='on',requestKey:value(form,'requestKey')})
},'Walk-in checked in. Hand the private claim receipt only to the patient or guardian.')}
export async function setPracticeWalkInState(_prev:WorkspaceState,form:FormData){return execute(async actor=>{
 const id=value(form,'id');await workspaceTransaction(actor,async(tx,d)=>{if(!await tx.one('SELECT id FROM clinic.walk_ins WHERE id=$1 AND doctor_id=$2',[id,d.id]))throw new DomainError('FORBIDDEN','This assigned visit is unavailable.',403)})
 await transitionWalkIn(actor,id,Number(value(form,'revision')),value(form,'next'))
},'Walk-in status saved.')}
export async function addPracticeBlock(_prev:WorkspaceState,form:FormData){return execute(actor=>blockCalendar(actor,{startsAt:timestamp(form),endsAt:timestamp(form,'endDay','endTime'),reason:value(form,'reason'),requestKey:value(form,'requestKey')}),'Calendar blocked. Existing appointments were not cancelled.')}
export async function removePracticeBlock(_prev:WorkspaceState,form:FormData){return execute(actor=>cancelCalendarBlock(actor,value(form,'id')),'Calendar block removed.')}
export async function addPracticeReminder(_prev:WorkspaceState,form:FormData){return execute(actor=>saveWorkspaceReminder(actor,{title:value(form,'title'),note:value(form,'note'),dueAt:timestamp(form),requestKey:value(form,'requestKey')}),'Private in-app reminder saved.')}
export async function setPracticeReminderState(_prev:WorkspaceState,form:FormData){return execute(actor=>finishWorkspaceReminder(actor,value(form,'id'),Number(value(form,'revision')),value(form,'next') as 'DONE'|'CANCELLED'),'Reminder updated.')}
export async function savePracticeSettings(_prev:WorkspaceState,form:FormData){return execute(actor=>{
 const raw:Record<string,unknown>=Object.fromEntries(form);for(const key of ['sms','email','whatsapp','confirmations','cancellations','reminders','payments','showContact'])if(value(form,'section')!=='profile')raw[key]=form.get(key)==='on'
 return saveWorkspaceSettings(actor,value(form,'section') as keyof WorkspacePreferences,raw,Number(value(form,'revision')))
},'Practice settings saved.')}
export async function savePracticeCatalogue(_prev:WorkspaceState,form:FormData){return execute(actor=>saveCatalogueItem(actor,{id:value(form,'id')||undefined,kind:value(form,'kind') as CatalogueKind,label:value(form,'label'),body:Object.fromEntries(form),revision:Number(value(form,'revision'))}),'Catalogue item saved.')}
export async function archivePracticeCatalogue(_prev:WorkspaceState,form:FormData){return execute(actor=>archiveCatalogueItem(actor,value(form,'id'),Number(value(form,'revision'))),'Catalogue item archived; signed records are retained.')}
export async function addPracticeStock(_prev:WorkspaceState,form:FormData){return execute(actor=>saveStockItem(actor,Object.fromEntries(form),value(form,'requestKey')),'Inventory item saved.')}
export async function receivePracticeStock(_prev:WorkspaceState,form:FormData){return execute(actor=>receiveStock(actor,{itemId:value(form,'itemId'),batchCode:value(form,'batchCode'),expiresOn:value(form,'expiresOn'),quantity:Number(value(form,'quantity')),purchase:value(form,'purchase'),sale:value(form,'sale'),supplier:value(form,'supplier'),requestKey:value(form,'requestKey')}),'Stock receipt recorded.')}
export async function adjustPracticeStock(_prev:WorkspaceState,form:FormData){return execute(actor=>adjustStock(actor,{batchId:value(form,'batchId'),revision:Number(value(form,'revision')),remove:Number(value(form,'remove')),reason:value(form,'reason'),requestKey:value(form,'requestKey')}),'Stock adjustment recorded.')}
export async function addPracticeExpense(_prev:WorkspaceState,form:FormData){return execute(actor=>recordWorkspaceExpense(actor,{date:value(form,'date'),category:value(form,'category'),amount:value(form,'amount'),payee:value(form,'payee'),reference:value(form,'reference'),note:value(form,'note'),attested:form.get('attested')==='on',requestKey:value(form,'requestKey')}),'Recorded expense saved.')}
export async function voidPracticeExpense(_prev:WorkspaceState,form:FormData){return execute(actor=>voidWorkspaceExpense(actor,value(form,'id'),Number(value(form,'revision'))),'Expense voided; audit history is retained.')}
export async function savePracticeCampaign(_prev:WorkspaceState,form:FormData){return execute(actor=>saveCampaign(actor,{id:value(form,'id')||undefined,title:value(form,'title'),headline:value(form,'headline'),description:value(form,'description'),audience:value(form,'audience'),budget:value(form,'budget'),startsOn:value(form,'startsOn'),endsOn:value(form,'endsOn'),revision:Number(value(form,'revision')),publicAttested:form.get('publicAttested')==='on'}),'Campaign draft saved. Funding and review are required before publication.')}
export async function setPracticeCampaignState(_prev:WorkspaceState,form:FormData){return execute(actor=>changeCampaign(actor,value(form,'id'),Number(value(form,'revision')),value(form,'next') as 'SUBMITTED'|'PAUSED'|'ARCHIVED'),'Campaign status saved.')}
export async function addPracticeStaffRequest(_prev:WorkspaceState,form:FormData){return execute(actor=>requestStaffAccess(actor,{name:value(form,'name'),email:value(form,'email'),role:value(form,'role'),note:value(form,'note'),requestKey:value(form,'requestKey')}),'Staff access request saved for administrator review.')}
export async function requestPracticeIntegration(_prev:WorkspaceState,form:FormData){return execute(async actor=>{
 const d=await workspaceTransaction(actor,async(_tx,doctor)=>doctor),kind=value(form,'kind');if(!['Digital health registration','Private record sharing','Clinic software plan','External advertising'].includes(kind))throw new DomainError('VALIDATION','Choose a supported setup request.',400)
 return createSupportCase(actor,'Clinic setup: '+kind,'Practice '+d.clinic+' ('+d.id+'). '+value(form,'detail'))
},'Setup request saved. This does not activate or certify the external service.')}
export async function decidePracticeStaff(_prev:WorkspaceState,form:FormData):Promise<WorkspaceState>{const admin=await currentAdmin();if(!admin)return {error:'Administrator sign-in required.'};try{await reviewStaffAccess(admin.id,value(form,'id'),Number(value(form,'revision')),value(form,'decision') as 'APPROVED'|'REJECTED',form.get('attested')==='on');revalidatePath('/admin/workspace');return {notice:'Staff access decision recorded.'}}catch(error){if(error instanceof DomainError)return {error:error.message};throw error}}
export async function decidePracticeCampaign(_prev:WorkspaceState,form:FormData):Promise<WorkspaceState>{const admin=await currentAdmin();if(!admin)return {error:'Administrator sign-in required.'};try{await reviewCampaign(admin.id,value(form,'id'),Number(value(form,'revision')),form.get('decision')==='APPROVED',form.get('attested')==='on');revalidatePath('/admin/workspace');revalidatePath('/search');return {notice:'Campaign review recorded.'}}catch(error){if(error instanceof DomainError)return {error:error.message};throw error}}

export async function reissuePracticeClaim(_prev:WorkspaceState,form:FormData){return execute(actor=>reissueClinicClaim(actor,value(form,'personId'),form.get('attested')==='on'),'New private claim receipt issued. The previous receipt no longer works.')}
