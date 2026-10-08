'use client'
import {useActionState} from 'react'
import {cancelBooking,rescheduleBooking,type BookingState} from '@/app/actions/care'
import {slotDay,slotTime,type SlotOption} from '@/lib/slot-format'
export function AppointmentControls({id,revision,slots}:{id:string;revision:number;slots:SlotOption[]}) {
 const [cancel,cancelAction,cancelPending]=useActionState(cancelBooking,{} as BookingState)
 const [move,moveAction,movePending]=useActionState(rescheduleBooking,{} as BookingState)
 return <div className="mt-4 space-y-3 border-t border-border pt-4"><form action={moveAction} className="flex flex-wrap gap-2"><input type="hidden" name="bookingId" value={id}/><input type="hidden" name="revision" value={revision}/><select name="slotId" required aria-label="Replacement appointment time" className="field min-w-0 flex-1"><option value="">Choose a replacement time</option>{slots.map(s=><option key={s.slotId} value={s.slotId}>{slotDay(s.startsAt)} · {slotTime(s.startsAt)}</option>)}</select><button disabled={movePending||!slots.length} className="care-button">{movePending?'Requesting…':'Reschedule'}</button></form>{(move.error||move.notice)&&<p role="status" className="text-sm">{move.error??move.notice}</p>}<form action={cancelAction}><input type="hidden" name="bookingId" value={id}/><input type="hidden" name="revision" value={revision}/><button disabled={cancelPending} className="min-h-11 text-sm font-semibold text-warning">{cancelPending?'Cancelling…':'Cancel appointment'}</button><p role="status" className="text-sm">{cancel.error??cancel.notice}</p></form></div>
}
