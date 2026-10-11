'use client'
import {useActionState} from 'react'
import {savePayoutBeneficiary,checkPayoutQueue,type PayoutState} from '@/app/actions/payouts'
export function PayoutBeneficiaryForm({doctorId}:{doctorId:string}){
 const [state,action,pending]=useActionState(savePayoutBeneficiary,{} as PayoutState)
 return <form action={action} className="mt-4 space-y-3"><input type="hidden" name="doctorId" value={doctorId}/><label className="block text-sm">Cashfree Payouts sandbox beneficiary ID<input name="beneficiaryId" required maxLength={50} pattern="[A-Za-z0-9_]+" className="field mt-2"/></label><label className="flex gap-3 text-sm"><input name="attested" type="checkbox" required className="mt-1 size-5"/>I checked that this beneficiary belongs to this doctor and is a sandbox account.</label><button disabled={pending} className="care-button">{pending?'Verifying…':'Verify and link beneficiary'}</button><p role="status" className="text-sm">{state.error??state.notice}</p></form>
}
export function PayoutQueueCheck(){const [state,action,pending]=useActionState(checkPayoutQueue,{} as PayoutState);return <form action={action}><button disabled={pending} className="care-button">{pending?'Checking…':'Check payout queue'}</button><p role="status" className="mt-3 text-sm">{state.error??state.notice}</p></form>}
