'use server'
import {currentAdmin} from '@/lib/auth'
import {revalidatePath} from 'next/cache'
import {bindDoctorBeneficiary,runDoctorPayouts} from '@/lib/domain/doctor-payouts'
import {DomainError} from '@/lib/domain/errors'
export type PayoutState={error?:string;notice?:string}
export async function savePayoutBeneficiary(_previous:PayoutState,form:FormData):Promise<PayoutState>{
 const admin=await currentAdmin();if(!admin)return {error:'Administrator sign-in required.'}
 try{await bindDoctorBeneficiary(admin.id,String(form.get('doctorId')??''),String(form.get('beneficiaryId')??''),form.get('attested')==='on');revalidatePath('/admin/payouts');return {notice:'Verified sandbox beneficiary linked. Eligible completed consultations will enter the payout worker.'}}
 catch(error){if(error instanceof DomainError)return {error:error.message};throw error}
}
export async function checkPayoutQueue(_previous:PayoutState):Promise<PayoutState>{
 const admin=await currentAdmin();if(!admin)return {error:'Administrator sign-in required.'}
 await runDoctorPayouts(1);revalidatePath('/admin/payouts');revalidatePath('/practice/billing');return {notice:'Payout queue checked. The current provider status is shown below.'}
}
