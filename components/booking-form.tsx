'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Building2, Video } from 'lucide-react'
import { bookAppointment, type BookingState } from '@/app/actions/care'

/** Fixed so the server and client agree — a real build reads the clinic calendar. */
const DAYS = ['Today', 'Tomorrow', 'Wed', 'Thu', 'Fri']
const SLOTS: Record<string, string[]> = {
  Morning: ['9:00 AM', '9:30 AM', '10:15 AM', '11:00 AM'],
  Afternoon: ['12:30 PM', '1:00 PM', '2:15 PM'],
  Evening: ['5:00 PM', '5:45 PM', '6:30 PM', '7:15 PM'],
}

export function BookingForm({
  slug,
  doctorName,
  offersVideo,
  patientName,
  family,
}: {
  slug: string
  doctorName: string
  offersVideo: boolean
  patientName: string
  /** The household. The account holder's own row is marked is_self. */
  family: { id: string; name: string; relation: string; is_self: boolean }[]
}) {
  const [state, action] = useActionState(bookAppointment, {} as BookingState)
  const [kind, setKind] = useState<'clinic' | 'video'>('clinic')
  const [day, setDay] = useState(DAYS[0])
  const [time, setTime] = useState('')

  return (
    <form action={action} className="rounded-xl border border-border bg-card p-6">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="slot" value={time ? `${day}, ${time}` : ''} />

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
          {DAYS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setDay(item)
                setTime('')
              }}
              aria-pressed={day === item}
              className={`min-h-11 rounded-lg border px-5 font-semibold transition-colors ${
                day === item
                  ? 'border-primary bg-cta text-cta-foreground'
                  : 'border-border hover:border-primary'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-7">
        <legend className="font-semibold">What time?</legend>
        <div className="mt-3 space-y-4">
          {Object.entries(SLOTS).map(([part, times]) => (
            <div key={part}>
              <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                {part}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {times.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTime(item)}
                    aria-pressed={time === item}
                    className={`min-h-10 rounded-lg border px-4 text-sm font-semibold transition-colors ${
                      time === item
                        ? 'border-primary bg-cta text-cta-foreground'
                        : 'border-border hover:border-primary hover:bg-soft'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      {state.error && (
        <p role="alert" className="mt-6 rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          {state.error}
        </p>
      )}

      <div className="mt-7 border-t border-border pt-6">
        <p className="text-sm text-muted-foreground">
          {time ? (
            <>
              Booking <span className="font-semibold text-foreground">{day}, {time}</span> —{' '}
              {kind === 'video' ? 'video consult' : 'clinic visit'}
            </>
          ) : (
            'Choose a time slot to continue.'
          )}
        </p>
        <Submit disabled={!time} />
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
