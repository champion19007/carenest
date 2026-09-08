'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { completeProfile, type ActionState } from '@/app/actions/auth'

const empty: ActionState = {}

export function WelcomeForm({ next }: { next?: string }) {
  const [state, action] = useActionState(completeProfile, empty)

  return (
    <form action={action} className="mt-8 space-y-5">
      {next && <input type="hidden" name="next" value={next} />}

      <div>
        <label htmlFor="name" className="sr-only">
          Your full name
        </label>
        <input
          id="name"
          name="name"
          autoFocus
          required
          maxLength={80}
          autoComplete="name"
          placeholder="Your full name"
          className="w-full rounded-lg border border-input bg-background px-4 py-4 text-lg outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          {state.error}
        </p>
      )}

      <Submit />
    </form>
  )
}

function Submit() {
  const status = useFormStatus()
  return (
    <button
      type="submit"
      disabled={status.pending}
      className="min-h-14 w-full rounded-lg bg-cta font-semibold text-cta-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {status.pending ? 'Saving…' : 'Continue'}
    </button>
  )
}
