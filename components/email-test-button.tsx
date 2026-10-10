'use client'
import {useActionState} from 'react'
import {requestEmailTest} from '@/app/actions/notifications'
export function EmailTestButton(){
 const [state,action,pending]=useActionState(requestEmailTest,{} as {error?:string;notice?:string})
 return <form action={action} className="mt-4"><button className="care-button" disabled={pending}>{pending?'Queueing…':'Send a test email'}</button><p className="mt-2 text-sm" role="status">{state.error??state.notice}</p></form>
}
