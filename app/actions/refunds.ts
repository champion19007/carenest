'use server'
import {requireUser,currentAdmin} from '@/lib/auth'
import {revalidatePath} from 'next/cache'
import {requestRefund,processRefund} from '@/lib/domain/billing'
import {rupeesToPaise} from '@/lib/money'
import {DomainError} from '@/lib/domain/errors'
export type RefundState={error?:string;notice?:string}
export async function askRefund(_prev:RefundState,form:FormData):Promise<RefundState>{const user=await requireUser('/account/billing');try{await requestRefund(user.id,String(form.get('paymentId')??''),rupeesToPaise(String(form.get('amountRupees')??'')),String(form.get('reason')??''));revalidatePath('/account/billing');return {notice:'Refund request recorded for review; money has not been returned yet.'}}catch(error){if(error instanceof DomainError)return {error:error.message};if(error instanceof Error&&error.message.startsWith('Enter a rupee amount'))return {error:error.message};throw error}}
export async function approveRefund(_prev:RefundState,form:FormData):Promise<RefundState>{const admin=await currentAdmin();if(!admin)return {error:'Administrator required.'};if(form.get('approved')!=='on')return {error:'Confirm the refund decision.'};try{await processRefund(admin.id,String(form.get('refundId')??''));revalidatePath('/admin/refunds');return {notice:'Provider refund submission recorded. Check its authoritative final state.'}}catch(error){if(error instanceof DomainError)return {error:error.message};if(error instanceof Error&&error.message.startsWith('Enter a rupee amount'))return {error:error.message};throw error}}
