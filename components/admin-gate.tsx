'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Lock } from 'lucide-react'
import { adminLogin } from '@/app/actions/auth'
import { Logo } from './logo'

export function AdminGate({ firstRun }: { firstRun: boolean }) {
  const [state, action] = useActionState(adminLogin, {} as { error?: string; notice?: string })

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-5 py-12">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8">
        <Logo />
        <span className="mt-8 flex size-12 items-center justify-center rounded-full bg-soft text-primary">
          <Lock className="size-5" />
        </span>
        <h1 className="mt-5 text-3xl">{firstRun ? 'Create the admin account' : 'Admin console'}</h1>
        <p className="mt-2 leading-7 text-muted-foreground">
          {firstRun
            ? 'This is the first run, so there is no admin yet. Set your credentials below.'
            : 'This area is separate from the patient site and the clinic app.'}
        </p>

        <form action={action} className="mt-7 space-y-4">
          <label className="block">
            <span className="font-semibold">Username</span>
            <input
              name="username"
              required
              minLength={3}
              autoComplete="username"
              className="mt-2 min-h-13 w-full rounded-lg border border-input bg-background px-4 outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <span className="font-semibold">Password</span>
            <input
              name="password"
              type="password"
              required
              minLength={10}
              autoComplete="current-password"
              className="mt-2 min-h-13 w-full rounded-lg border border-input bg-background px-4 outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          {state.error && (
            <p role="alert" className="rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
              {state.error}
            </p>
          )}

          <Submit />
        </form>

        <p className="mt-6 border-t border-border pt-5 text-sm leading-6 text-muted-foreground">
          {firstRun
            ? 'No admin exists yet. The username and password you enter now will create the sole admin account — choose a strong password, it is stored hashed with scrypt.'
            : 'Passwords are hashed with scrypt and never stored in plain text. Repeated failures are rate limited.'}
        </p>
      </div>
    </main>
  )
}

function Submit() {
  const status = useFormStatus()
  return (
    <button
      type="submit"
      disabled={status.pending}
      className="min-h-13 w-full rounded-lg bg-cta font-semibold text-cta-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {status.pending ? 'Checking…' : 'Continue'}
    </button>
  )
}
