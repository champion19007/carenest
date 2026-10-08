'use server'
import {requireUser} from '@/lib/auth'
import {revalidatePath} from 'next/cache'
import {DomainError} from '@/lib/domain/errors'
import {registerWalkIn,transitionWalkIn,claimClinicVisit} from '@/lib/domain/walk-ins'
import {saveAddress,transitionHomeVisit} from '@/lib/domain/home-visits'
export type OperationsState={error?:string;notice?:string;claimToken?:string|null}
const value=(form:FormData,name:string)=>String(form.get(name)??'')
export async function addWalkIn(_prev:OperationsState,form:FormData):Promise<OperationsState>{
 const user=await requireUser('/staff/clinic')
 try{const result=await registerWalkIn(user.id,{clinicId:value(form,'clinicId'),doctorId:value(form,'doctorId'),name:value(form,'name'),phone:value(form,'phone'),dob:value(form,'dob'),sex:value(form,'sex'),kind:value(form,'kind'),species:value(form,'species'),guardian:value(form,'guardian'),reason:value(form,'reason'),consentAttested:form.get('consentAttested')==='on',requestKey:value(form,'requestKey')});revalidatePath('/staff/clinic');revalidatePath('/practice/patients');return {notice:'Walk-in recorded. Hand the private claim receipt only to this patient or guardian.',claimToken:result.claimToken}}
 catch(error){if(error instanceof DomainError)return {error:error.message};throw error}
}
export async function changeWalkIn(_prev:OperationsState,form:FormData):Promise<OperationsState>{const user=await requireUser('/staff/clinic');try{await transitionWalkIn(user.id,value(form,'id'),Number(value(form,'revision')),value(form,'next'));revalidatePath('/staff/clinic');revalidatePath('/practice/patients');return {notice:'Visit status recorded.'}}catch(error){if(error instanceof DomainError)return {error:error.message};throw error}}
export async function claimVisit(_prev:OperationsState,form:FormData):Promise<OperationsState>{const user=await requireUser('/account/claim');try{await claimClinicVisit(user.id,value(form,'token'),form.get('confirmed')==='on');revalidatePath('/account/records');return {notice:'Visit linked to your account. Your assigned records and invoice are now available.'}}catch(error){if(error instanceof DomainError)return {error:error.message};throw error}}
export async function addAddress(_prev:OperationsState,form:FormData):Promise<OperationsState>{const user=await requireUser('/account/addresses');try{await saveAddress(user.id,Object.fromEntries(form));revalidatePath('/account/addresses');return {notice:'Private address saved.'}}catch(error){if(error instanceof DomainError)return {error:error.message};throw error}}
export async function changeDispatch(_prev:OperationsState,form:FormData):Promise<OperationsState>{const user=await requireUser('/staff/dispatch');try{await transitionHomeVisit(user.id,value(form,'id'),Number(value(form,'revision')),value(form,'next'),value(form,'assignee'));revalidatePath('/staff/dispatch');return {notice:'Dispatch status recorded.'}}catch(error){if(error instanceof DomainError)return {error:error.message};throw error}}
