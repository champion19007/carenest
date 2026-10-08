'use client'
import {useActionState} from 'react'
import {checkInBooking,type BookingState} from '@/app/actions/care'
export function CheckIn({bookingId}:{bookingId:string}){const[state,action,pending]=useActionState(checkInBooking,{} as BookingState);return <form action={action} className="mt-4"><input name="bookingId" type="hidden" value={bookingId}/><button disabled={pending} className="care-button">{pending?'Checking in…':'Check in near your appointment'}</button><p role="status" className="mt-2 text-sm">{state.error??state.notice}</p></form>}
