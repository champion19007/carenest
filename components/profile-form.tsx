'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { CheckCircle2 } from 'lucide-react'
import { saveProfile, type ProfileState } from '@/app/actions/profile'

const empty: ProfileState = {}

export type ProfileFields = {
  name: string
  email: string | null
  phone: string | null
  dob: string | null
  gender: string | null
  city: string | null
}

/** Dates arrive from Postgres as timestamps; the input wants YYYY-MM-DD. */
function dateValue(value: string | null) {
  if (!value) return ''
  return value.slice(0, 10)
}

export function ProfileForm({ user }: { user: ProfileFields }) {
  const [state, action] = useActionState(saveProfile, empty)

  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" htmlFor="name">
          <input
            id="name"
            name="name"
            defaultValue={user.name}
            required
            maxLength={80}
            autoComplete="name"
            className="field"
          />
        </Field>

        <Field label="Email" htmlFor="email" hint="Used for report delivery.">
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={user.email ?? ''}
            autoComplete="email"
            className="field"
          />
        </Field>

        <Field
          label="Mobile number"
          htmlFor="phone"
          hint={
            user.phone
              ? 'Verified by one-time code. Contact support to change it.'
              : 'Add one at your first booking.'
          }
        >
          {/* Disabled, not hidden: the number is the account's identity and is
              changed by verifying a new one, never by typing over it. */}
          <input
            id="phone"
            value={user.phone ? `+91 ${user.phone}` : 'Not set'}
            disabled
            className="field opacity-60"
          />
        </Field>

        <Field label="Date of birth" htmlFor="dob" hint="Helps clinics confirm it is you.">
          <input
            id="dob"
            name="dob"
            type="date"
            defaultValue={dateValue(user.dob)}
            max={new Date().toISOString().slice(0, 10)}
            className="field"
          />
        </Field>

        <Field label="Gender" htmlFor="gender">
          <select id="gender" name="gender" defaultValue={user.gender ?? ''} className="field">
            <option value="">Prefer not to say</option>
            <option>Female</option>
            <option>Male</option>
            <option>Other</option>
          </select>
        </Field>

        <Field label="City" htmlFor="city">
          <input id="city" name="city" defaultValue={user.city ?? ''} className="field" />
        </Field>
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">
          <CheckCircle2 className="size-4" />
          {state.notice}
        </p>
      )}

      <Save />
    </form>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block font-semibold">
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-1.5 text-sm text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Save() {
  const status = useFormStatus()
  return (
    <button
      type="submit"
      disabled={status.pending}
      className="min-h-12 rounded-lg bg-cta px-8 font-semibold text-cta-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {status.pending ? 'Saving…' : 'Save changes'}
    </button>
  )
}
