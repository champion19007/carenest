'use client'
import {useActionState} from 'react'
import {createMobilePairing,revokeDevice,type MobileState} from '@/app/actions/mobile'
export function MobilePairForm(){const[s,a,p]=useActionState(createMobilePairing,{} as MobileState);return <form action={a} className="space-y-4 rounded-2xl border p-5"><button disabled={p} className="care-button">Create private pairing code</button>{s.code&&<code className="block break-all select-all rounded-xl bg-soft p-4">{s.code}</code>}<p role="status">{s.error??s.notice}</p></form>}
export function RevokeDeviceForm({id}:{id:string}){const[s,a,p]=useActionState(revokeDevice,{} as MobileState);return <form action={a} className="mt-4"><input name="id" value={id} type="hidden"/><button disabled={p} className="care-button">Revoke device access</button><p role="status">{s.error??s.notice}</p></form>}
