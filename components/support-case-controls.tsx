'use client'
import {useActionState} from 'react'
import {reviewSupportCase,type SupportState} from '@/app/actions/support'
export function SupportCaseControls({id,state}:{id:string;state:string}){
 const[result,action,pending]=useActionState(reviewSupportCase,{} as SupportState),next=state==='IN_REVIEW'?'RESOLVED':'IN_REVIEW'
 return <form action={action} className="mt-4 space-y-3"><input type="hidden" name="caseId" value={id}/><input type="hidden" name="expected" value={state}/><input type="hidden" name="next" value={next}/><label className="flex min-h-11 items-center gap-2 text-sm"><input name="reviewed" type="checkbox" required/>I reviewed this request and its current status</label><button disabled={pending} className="care-button">{state==='OPEN'?'Start review':state==='IN_REVIEW'?'Mark resolved':'Reopen for review'}</button><p role="status" className="text-sm">{result.error??result.notice}</p></form>
}
