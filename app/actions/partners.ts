'use server'
import {currentAdmin} from '@/lib/auth'
import {revalidatePath} from 'next/cache'
import {publishLabPackage,assignClinicStaff} from '@/lib/domain/partners'
import {DomainError} from '@/lib/domain/errors'
export type PartnerState={error?:string;notice?:string}
export async function addLabPartner(_prev:PartnerState,form:FormData):Promise<PartnerState>{const admin=await currentAdmin();if(!admin)return {error:'Administrator required.'};try{const saved=await publishLabPackage(admin.id,{clinicName:form.get('clinicName'),address:form.get('address'),city:form.get('city'),name:form.get('name'),description:form.get('description'),feePaise:form.get('feePaise'),verification:form.get('verification'),checked:form.get('checked')==='on'});revalidatePath('/admin/partners');revalidatePath('/labs');return {notice:`Verified package saved. Clinic ID: ${saved.clinicId}`}}catch(error){if(error instanceof DomainError)return {error:error.message};throw error}}
export async function addClinicStaff(_prev:PartnerState,form:FormData):Promise<PartnerState>{const admin=await currentAdmin();if(!admin)return {error:'Administrator required.'};try{await assignClinicStaff(admin.id,String(form.get('clinicId')??''),String(form.get('userId')??''),String(form.get('role')??''));revalidatePath('/admin/partners');return {notice:'Clinic membership recorded. This does not grant full clinical chart access.'}}catch(error){if(error instanceof DomainError)return {error:error.message};throw error}}
