'use client'
import {useActionState} from 'react'
import {reviewProvider,type ProviderState} from '@/app/actions/providers'
export function ProviderReviewForm({id,revision}:{id:string;revision:number}){
 const [state,action,pending]=useActionState(reviewProvider,{} as ProviderState)
 return <form action={action} className="mt-5 space-y-4">
  <input name="applicationId" type="hidden" value={id}/><input name="revision" type="hidden" value={revision}/>
  <label className="block text-sm">Decision<select name="decision" className="field mt-2"><option value="NEEDS_CHANGES">Request changes</option><option value="APPROVED">Approve and publish</option><option value="REJECTED">Reject</option></select></label>
  <fieldset className="space-y-2"><legend className="font-semibold">Required approval checks</legend>
   {[['identityMatched','Photo identity matches the applicant'],['registrationChecked','Registration is current and matches the appropriate professional register'],['qualificationMatched','Qualifications support the requested specialty'],['clinicMatched','Clinic affiliation and address evidence match the profile']].map(([name,label])=><label key={name} className="flex min-h-11 gap-3 text-sm leading-6"><input name={name} type="checkbox" className="mt-1"/>{label}</label>)}
  </fieldset>
  <label className="block text-sm">Professional register URL<input name="sourceUrl" type="url" maxLength={1000} className="field mt-2" placeholder="https://..." /></label>
  <label className="block text-sm">Register lookup reference or result<input name="sourceReference" maxLength={300} className="field mt-2" placeholder="Record the matched council entry and lookup result"/></label>
  <label className="block text-sm">Decision reason<textarea name="reason" required minLength={10} maxLength={1000} rows={3} className="field mt-2"/></label>
  <p className="text-xs leading-6 text-muted-foreground">Approval requires all four checks, the actual register source and a lookup reference. This records your review; it does not query or certify a government register automatically.</p>
  <button disabled={pending} className="care-button">{pending?'Recording…':'Record verification decision'}</button><p role="status" className="text-sm">{state.error??state.notice}</p>
 </form>
}
