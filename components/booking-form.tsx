'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Building2, Video } from 'lucide-react'
import { bookAppointment, type BookingState } from '@/app/actions/care'
import { groupByDay, slotTime, type SlotOption } from '@/lib/slot-format'


export function BookingForm({
  slug,
  doctorName,
  offersVideo,
  patientName,
  family,
  slots,
}: {
  slug: string
  doctorName: string
  offersVideo: boolean
  patientName: string
  /** Real, currently-free slots from the clinic's calendar. */
  slots: SlotOption[]
  /** The household. The account holder's own row is marked is_self. */
  family: { id: string; name: string; relation: string; is_self: boolean }[]
}) {
  const [state, action] = useActionState(bookAppointment, {} as BookingState)
  const [kind, setKind] = useState<'clinic' | 'video'>('clinic')

  const days = groupByDay(slots)
  const [day, setDay] = useState(days[0]?.day ?? '')
  /* The slot id, not a time string. The server must be told which row to
     claim; a label like "Today, 6:30 PM" identifies nothing it can lock. */
  const [slotId, setSlotId] = useState('')

  const chosen = slots.find((slot) => slot.slotId === slotId)
  const shown = days.find((entry) => entry.day === day) ?? days[0]

  return (
    <form action={action} className="rounded-xl border border-border bg-card p-6">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="slotId" value={slotId} />

      {family.length > 1 ? (
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

      <fieldset className="mt-7">
        <legend className="font-semibold">Which day?</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {days.map((entry) => (
            <button
              key={entry.day}
              type="button"
              onClick={() => {
                setDay(entry.day)
                setSlotId('')
              }}
              aria-pressed={day === entry.day}
              className={`min-h-11 rounded-lg border px-5 font-semibold transition-colors ${
                day === entry.day
                  ? 'border-primary bg-cta text-cta-foreground'
                  : 'border-border hover:border-primary'
              }`}
            >
              {entry.day}
              <span className="ml-2 text-xs font-normal opacity-75">
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
        <p className="text-sm text-muted-foreground">
          {chosen ? (
            <>
              Booking{' '}
              <span className="font-semibold text-foreground">
                {day}, {slotTime(chosen.startsAt)}
              </span>{' '}
              — {kind === 'video' ? 'video consult' : 'clinic visit'}
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
      {status.pending ? 'Confirming…' : 'Confirm appointment'}
    </button>
  )
}
