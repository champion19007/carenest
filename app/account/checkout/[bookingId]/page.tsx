import Link from 'next/link'
import {notFound} from 'next/navigation'
import {requireUser} from '@/lib/auth'
import {getDb,ensureSchema} from '@/lib/db/client'
import {PatientWorkspace} from '@/components/patient-workspace'
import {PaymentStatusButton} from '@/components/checkout-button'
import {AppointmentPayment} from '@/components/appointment-payment'
import {slotDay,slotTime} from '@/lib/slot-format'
import {formatPaise} from '@/lib/money'

export const dynamic='force-dynamic'
export const metadata={title:'Appointment payment · CareNest',robots:{index:false}}
export default async function AppointmentCheckout({params}:{params:Promise<{bookingId:string}>}){
 const {bookingId}=await params,user=await requireUser(`/account/checkout/${encodeURIComponent(bookingId)}`)
 await ensureSchema()
 const b=await getDb().one<{id:string;status:string;kind:string;starts_at:string;ends_at:string;doctor_name:string;slug:string;invoice_id:string;total_paise:string;invoice_state:string;locked_until:string|null;live:boolean}>(`SELECT b.*,d.name doctor_name,d.slug,i.id invoice_id,i.total_paise,i.state invoice_state,s.locked_until,
 s.status='HELD' AND s.reserved_booking_id=b.id AND s.locked_until>clock_timestamp() AND s.slot_start>clock_timestamp() live
 FROM patient.bookings b JOIN provider.doctors d ON d.id=b.doctor_id JOIN clinic.invoices i ON i.booking_id=b.id
 JOIN provider.appointment_slots s ON s.slot_id=b.slot_id WHERE b.id=$1 AND b.user_id=$2 AND b.payment_required=true`,[bookingId,user.id])
 if(!b)notFound()
 const confirmed=['confirmed','attended'].includes(b.status)&&['PAID','WAIVED'].includes(b.invoice_state)
 const payable=b.status==='requested'&&b.live&&b.invoice_state==='UNPAID'
 const orders=await getDb().query<{external_id:string;state:string}>("SELECT external_id,state FROM payment_orders WHERE invoice_id=$1 AND gateway='cashfree' AND external_id IS NOT NULL ORDER BY created_at DESC LIMIT 10",[b.invoice_id])
 return <PatientWorkspace title={confirmed?'Appointment scheduled':'Confirm your appointment'} description="Cashfree sandbox · test payments only. No real money is collected.">
  <section className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-6">
   <h2 className="text-xl">{b.doctor_name}</h2><p className="mt-3">{slotDay(b.starts_at)} · {slotTime(b.starts_at)} IST</p>
   <p className="mt-2 text-sm">{b.kind.replaceAll('_',' ')} · {Math.round((Date.parse(b.ends_at)-Date.parse(b.starts_at))/60000)} minutes</p>
   <p className="mt-5 text-lg font-semibold">Consultation total: {formatPaise(b.total_paise)}</p>
   {confirmed?<><p role="status" className="mt-4 rounded-xl bg-soft p-4">{b.status==='attended'?'Consultation completed. Your history is available.':'Payment verified. Your appointment is scheduled.'}</p><Link href={`/account?requested=${encodeURIComponent(b.id)}`} className="care-button mt-5">View appointment</Link></>:
    payable?<><p className="mt-4 text-sm leading-7">Your time is held until {slotTime(b.locked_until!)} IST. If payment fails or you close checkout, the appointment stays unscheduled. You can check payment status before retrying.</p><AppointmentPayment invoiceId={b.invoice_id} bookingId={b.id} deadline={b.locked_until!}/></>:
    <><p role="status" className="mt-4 text-sm">This appointment is {b.status==='requested'?'past its payment deadline':b.status}. It cannot be scheduled by a late payment. Any late or excess payment enters refund review.</p><Link href={`/book/${b.slug}`} className="care-button mt-4">Choose another time</Link></>}
   {!confirmed&&orders.map(o=><PaymentStatusButton key={o.external_id} orderId={o.external_id} bookingId={b.id}/>)}
   <Link href="/account/billing" className="mt-5 block text-sm text-primary">Receipts and refund requests</Link>
  </section>
 </PatientWorkspace>
}
