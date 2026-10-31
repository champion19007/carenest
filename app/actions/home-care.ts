'use server'
import {revalidatePath} from 'next/cache'
import {currentAdmin,requireUser} from '@/lib/auth'
import {requestHomeCare,changeHomeCareRequest} from '@/lib/domain/home-care'
import {DomainError} from '@/lib/domain/errors'

export type HomeCareState={error?:string;notice?:string;id?:string}
const value=(form:FormData,name:string)=>String(form.get(name)??'')
function refresh(){revalidatePath('/account/home-care');revalidatePath('/admin/home-care')}
export async function submitHomeCare(_state:HomeCareState,form:FormData):Promise<HomeCareState>{
 const user=await requireUser('/home-care/request')
 try{const id=await requestHomeCare(user.id,{...Object.fromEntries(form),consent:form.get('consent')==='on'});refresh();return {id,notice:'Your request is saved. Availability and fees still need review.'}}
 catch(error){if(error instanceof DomainError)return {error:error.message};throw error}
}
export async function cancelHomeCare(_state:HomeCareState,form:FormData):Promise<HomeCareState>{
 const user=await requireUser('/account/home-care')
 try{await changeHomeCareRequest(user.id,value(form,'id'),Number(value(form,'revision')),'CANCELLED');refresh();return {notice:'Request cancelled.'}}
 catch(error){if(error instanceof DomainError)return {error:error.message};throw error}
}
export async function reviewHomeCare(_state:HomeCareState,form:FormData):Promise<HomeCareState>{
 const admin=await currentAdmin();if(!admin)return {error:'Sign in to the admin console again.'}
 try{await changeHomeCareRequest(admin.id,value(form,'id'),Number(value(form,'revision')),value(form,'next'),value(form,'note'),true);refresh();return {notice:'Review saved. The patient can see your response.'}}
 catch(error){if(error instanceof DomainError)return {error:error.message};throw error}
}
