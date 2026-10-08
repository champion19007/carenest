'use server'
import {requireUser} from '@/lib/auth'
import {revalidatePath} from 'next/cache'
import {recordClinicPayment} from '@/lib/domain/billing'
import {DomainError} from '@/lib/domain/errors'
export type BillingState={error?:string;notice?:string}
export async function recordPayment(_prev:BillingState,form:FormData):Promise<BillingState>{const user=await requireUser('/practice/billing');if(form.get('received')!=='on')return {error:'Confirm the payment was actually received.'};try{await recordClinicPayment(user.id,String(form.get('invoiceId')??''),String(form.get('method')??''),String(form.get('amountPaise')??''));revalidatePath('/practice/billing');revalidatePath('/account/billing');revalidatePath('/staff/pharmacy');revalidatePath('/staff/clinic');return {notice:'Payment receipt recorded. This does not initiate a bank transfer.'}}catch(error){if(error instanceof DomainError)return {error:error.message};throw error}}
