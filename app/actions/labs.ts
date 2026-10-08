'use server'
import {requireUser} from '@/lib/auth'
import {revalidatePath} from 'next/cache'
import {requestLabOrder,updateLabOrder} from '@/lib/domain/labs'
import {DomainError} from '@/lib/domain/errors'
import {consumeLimits} from '@/lib/domain/rate-limit'
export type LabState={error?:string;notice?:string}
export async function bookLabPackage(_prev:LabState,form:FormData):Promise<LabState>{const user=await requireUser('/labs');try{const limited=await consumeLimits([{bucket:'lab-orders',key:user.id,limit:5,seconds:3600}]);if(!limited.allowed)return {error:'Please review existing lab requests before adding more.'};await requestLabOrder(user.id,String(form.get('packageId')??''),String(form.get('familyId')??'')||null,String(form.get('requestKey')??''),form.get('consent')==='on');revalidatePath('/account/labs');return {notice:'Lab request recorded. The lab must confirm a collection time.'}}catch(error){if(error instanceof DomainError)return {error:error.message};throw error}}
export async function changeLabOrder(_prev:LabState,form:FormData):Promise<LabState>{const user=await requireUser('/staff/labs');try{await updateLabOrder(user.id,String(form.get('orderId')??''),String(form.get('state')??''),String(form.get('scheduledAt')??''),String(form.get('resultFile')??''));revalidatePath('/staff/labs');revalidatePath('/account/labs');return {notice:'Lab order transition recorded.'}}catch(error){if(error instanceof DomainError)return {error:error.message};throw error}}
