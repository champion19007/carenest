'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Building2, Video,Home } from 'lucide-react'
import { bookAppointment, type BookingState } from '@/app/actions/care'
import { groupByDay, slotTime, type SlotOption } from '@/lib/slot-format'


export function BookingForm({
  slug,
  doctorName,
  offersVideo,
  offersHomeVisit=false,
  addresses=[],
  patientName,
  family,
  slots,
  initialSlotId = '',
  requestKey,
  pets = [],
  subjectKind = 'human',
}: {
  slug: string
  doctorName: string
  offersVideo: boolean
  offersHomeVisit?:boolean
  addresses?:{id:string;label:string}[]
  patientName: string
  initialSlotId?: string
  requestKey: string
  pets?: { id: string; name: string; species: string }[]
  subjectKind?: 'human' | 'pet'
  /** Real, currently-free slots from the clinic's calendar. */
  slots: SlotOption[]
  /** The household. The account holder's own row is marked is_self. */
  family: { id: string; name: string; relation: string; is_self: boolean }[]
}) {
  const [state, action] = useActionState(bookAppointment, {} as BookingState)
  const [kind, setKind] = useState<'clinic' | 'video' | 'home_visit'>('clinic')

  const days = groupByDay(slots)
  const initialDay = days.find(entry => entry.slots.some(slot => slot.slotId === initialSlotId))?.day
  const [day, setDay] = useState(initialDay ?? days[0]?.day ?? '')
  /* The slot id, not a time string. The server must be told which row to
     claim; a label like "Today, 6:30 PM" identifies nothing it can lock. */
  const [slotId, setSlotId] = useState(initialSlotId)

  const chosen = slots.find((slot) => slot.slotId === slotId)
  const shown = days.find((entry) => entry.day === day) ?? days[0]

  return (
    <form action={action} className="rounded-[1.5rem] border border-border bg-card p-5 sm:p-7">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="requestKey" value={requestKey} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="slotId" value={slotId} />

      {subjectKind === 'pet' ? <label className="block"><span className="block font-semibold">Which pet is this for?</span><select name="petId" required className="field mt-2"><option value="">Choose your pet</option>{pets.map(pet=><option key={pet.id} value={pet.id}>{pet.name} · {pet.species}</option>)}</select><a href="/account/pets" className="mt-2 inline-block text-sm text-primary">Add or manage pets</a></label> : family.length > 1 ? (
        <label className="block">
          <span className="font-semibold">Who is this appointment for?</span>
          <select
            name="patientFor"
            defaultValue={family.find((member) => member.is_self)?.id ?? ''}
            className="field mt-2"
          >
            {family.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
                {member.is_self ? ' (you)' : ` · ${member.relation}`}
              </option>
            ))}
          </select>
          {/* The clinic's calendar shows this name, not the account holder's,
              so a visit booked for a parent arrives under the parent's name. */}
          <span className="mt-1.5 block text-sm text-muted-foreground">
            The clinic sees this person&apos;s name and age on their calendar.
          </span>
        </label>
      ) : (
        <p className="text-sm text-muted-foreground">
          Booking as <span className="font-semibold text-foreground">{patientName}</span>
        </p>
      )}

      <fieldset className="mt-6">
        <legend className="font-semibold">How would you like to be seen?</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setKind('clinic')}
            aria-pressed={kind === 'clinic'}
            className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
              kind === 'clinic' ? 'border-primary bg-soft' : 'border-border hover:border-primary'
            }`}
          >
            <Building2 className="mt-0.5 size-5 shrink-0 text-primary" />
            <span>
              <span className="block font-semibold">Clinic visit</span>
              <span className="block text-sm text-muted-foreground">
                See {doctorName} in person at the clinic.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setKind('video')}
            disabled={!offersVideo}
            aria-pressed={kind === 'video'}
            className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              kind === 'video' ? 'border-primary bg-soft' : 'border-border hover:border-primary'
            }`}
          >
            <Video className="mt-0.5 size-5 shrink-0 text-primary" />
            <span>
              <span className="block font-semibold">Video consult</span>
              <span className="block text-sm text-muted-foreground">
                {offersVideo
                  ? 'A scheduled video call. Good for follow-ups and repeat prescriptions.'
                  : 'This doctor does not offer video consultations.'}
              </span>
            </span>
          </button>
        </div>
      </fieldset>

      {offersHomeVisit&&<button type="button" onClick={()=>setKind('home_visit')} aria-pressed={kind==='home_visit'} className={`mt-4 flex min-h-14 w-full items-center gap-3 rounded-xl border p-4 ${kind==='home_visit'?'border-primary bg-soft':'border-border'}`}><Home className="size-5 text-primary"/><span>Home visit · request clinic confirmation and dispatch</span></button>}
      {kind==='home_visit'&&<label className="mt-5 block text-sm">Private visit address<select name="addressId" required className="field mt-2"><option value="">Choose your address</option>{addresses.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select><a href="/account/addresses" className="mt-2 inline-block text-primary">Add an address</a></label>}
      <fieldset className="mt-7">
        <legend className="font-semibold">Which day?</legend>
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          {days.map((entry) => (
            <button
              key={entry.day}
              type="button"
              onClick={() => {
                setDay(entry.day)
                setSlotId('')
              }}
              aria-pressed={day === entry.day}
              className={`min-h-16 shrink-0 rounded-2xl border px-4 text-sm font-semibold transition-colors ${
                day === entry.day
                  ? 'border-primary bg-cta text-cta-foreground'
                  : 'border-border hover:border-primary'
              }`}
            >
              {entry.day}
              <span className="mt-1 block text-[10px] font-normal opacity-75">
                {entry.slots.length} free
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-7">
        <legend className="font-semibold">What time?</legend>
        {shown && shown.slots.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {shown.slots.map((slot) => (
              <button
                key={slot.slotId}
                type="button"
                onClick={() => setSlotId(slot.slotId)}
                aria-pressed={slotId === slot.slotId}
                className={`min-h-10 rounded-lg border px-4 text-sm font-semibold transition-colors ${
                  slotId === slot.slotId
                    ? 'border-primary bg-cta text-cta-foreground'
                    : 'border-border hover:border-primary hover:bg-soft'
                }`}
              >
                {slotTime(slot.startsAt)}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No free times left on this day. Try another.
          </p>
        )}
      </fieldset>

      {state.error && (
        <p role="alert" className="mt-6 rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          {state.error}
        </p>
      )}

      <div className="mt-7 border-t border-border pt-6">
        <label className="mb-4 flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" name="consent" required className="mt-1 size-5 shrink-0" /><span>I agree to share the necessary patient or pet details with this clinic for this appointment. <a className="text-primary underline" href="/policies/privacy">Privacy details</a></span></label>
        {kind==='video'&&<label className="mb-4 flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" name="videoConsent" required className="mt-1 size-5 shrink-0"/><span>I agree to use the clinic’s configured video service for this consultation. CareNest does not record the call.</span></label>}
        <p className="text-sm text-muted-foreground">
          {chosen ? (
            <>
              Booking{' '}
              <span className="font-semibold text-foreground">
                {day}, {slotTime(chosen.startsAt)}
              </span>{' '}
              — {kind === 'video' ? 'video consult' : kind==='home_visit'?'home visit':'clinic visit'}
            </>
          ) : (
            'Choose a time slot to continue.'
          )}
        </p>
        <Submit disabled={!slotId} />
      </div>
    </form>
  )
}

function Submit({ disabled }: { disabled: boolean }) {
  const status = useFormStatus()
  return (
    <button
      type="submit"
      disabled={disabled || status.pending}
      className="mt-4 min-h-13 w-full rounded-lg bg-cta font-semibold text-cta-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {status.pending ? 'Holding your time…' : 'Continue to payment'}
    </button>
  )
}
