'use client'
import {useActionState} from 'react'
import {beginConsultation,markAttended,markNoShow,type PracticeState} from '@/app/actions/practice'
function VisitAction({id,kind}:{id:string;kind:'start'|'attended'|'no_show'}){const[state,action,pending]=useActionState(kind==='start'?beginConsultation:kind==='attended'?markAttended:markNoShow,{} as PracticeState);return <form action={action}><input name="bookingId" type="hidden" value={id}/><button disabled={pending} className="min-h-11 rounded-xl border border-border px-3 text-xs font-semibold">{pending?'Saving…':kind==='start'?'Start consultation':kind==='attended'?'Mark attended':'Mark no-show'}</button><p role="status" className="mt-1 text-xs">{state.error??state.notice}</p></form>}
export function ClinicVisitActions({id}:{id:string}){return <div className="mt-4 flex flex-wrap gap-3">{(['start','attended','no_show'] as const).map(kind=><VisitAction key={kind} id={id} kind={kind}/>)}</div>}
