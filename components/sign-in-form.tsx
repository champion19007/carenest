'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Info } from 'lucide-react'
import { requestOtp, verifyOtp, type ActionState } from '@/app/actions/auth'

const empty: ActionState = {}

export function SignInForm({ next }: { next?: string }) {
  const [phoneState, requestAction] = useActionState(requestOtp, empty)
  const [verifyState, verifyAction] = useActionState(verifyOtp, empty)

  /* Once a code has been issued we swap to the verification step. */
  const phone = verifyState.phone ?? phoneState.phone
  const stage: 'phone' | 'code' = phoneState.otpHint ? 'code' : 'phone'

  if (stage === 'code' && phone) {
    return (
      <VerifyStep
        action={verifyAction}
        state={verifyState}
        phone={phone}
        otpHint={phoneState.otpHint}
        next={next}
      />
    )
  }

  return (
    <form action={requestAction} className="mt-8 space-y-5">
      <div>
        <label htmlFor="phone" className="block font-semibold">
          Mobile number
        </label>
        <div className="mt-2 flex min-h-14 overflow-hidden rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
          <span className="flex items-center border-r border-border bg-muted px-4 font-semibold">
            +91
          </span>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            required
            maxLength={10}
            autoComplete="tel-national"
            placeholder="98765 43210"
            className="min-w-0 flex-1 bg-transparent px-4 text-lg outline-none"
          />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          10 digits, no country code. Indian numbers only for now.
        </p>
      </div>

      {phoneState.error && (
        <p role="alert" className="rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          {phoneState.error}
        </p>
      )}

      <Submit label="Send code" pending="Sending…" />
    </form>
  )
}

function VerifyStep({
  action,
  state,
  phone,
  otpHint,
  next,
}: {
  action: (formData: FormData) => void
  state: ActionState
  phone: string
  otpHint?: string
  next?: string
}) {
  const [code, setCode] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <form action={action} className="mt-8 space-y-5">
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="next" value={next ?? '/dashboard/patient'} />

      <div>
        <label htmlFor="code" className="block font-semibold">
          Enter the 6-digit code
        </label>
        <p className="mt-1 text-sm text-muted-foreground">
          Sent to +91 {phone.slice(0, 5)} {phone.slice(5)}
        </p>
        <input
          id="code"
          name="code"
          ref={inputRef}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          placeholder="------"
          className="mt-3 w-full rounded-lg border border-input bg-background px-4 py-4 text-center font-mono text-3xl tracking-[0.5em] outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {otpHint && (
        <p className="flex items-start gap-2 rounded-lg bg-soft px-4 py-3 text-sm leading-6 text-primary">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            No SMS gateway is connected in this build, so your code is shown here:{' '}
            <strong className="font-mono text-base">{otpHint}</strong>
          </span>
        </p>
      )}

      {state.error && (
        <p role="alert" className="rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          {state.error}
        </p>
      )}

      <Submit label="Verify and continue" pending="Verifying…" />

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="w-full text-center text-sm font-semibold text-primary hover:underline"
      >
        Use a different number
      </button>
    </form>
  )
}

function Submit({ label, pending }: { label: string; pending: string }) {
  const status = useFormStatus()
  return (
    <button
      type="submit"
      disabled={status.pending}
      className="min-h-14 w-full rounded-lg bg-cta font-semibold text-cta-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {status.pending ? pending : label}
    </button>
  )
}
