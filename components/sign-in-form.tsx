'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Info } from 'lucide-react'
import { requestOtp, verifyOtp, type ActionState } from '@/app/actions/auth'

const empty: ActionState = {}

export function SignInForm({ next, google,whatsapp=false,localDemo=false,dualOtp=false,smsReady=true,setupNotice }: { next?: string; google?: boolean;whatsapp?:boolean;localDemo?:boolean;dualOtp?:boolean;smsReady?:boolean;setupNotice?:string }) {
  const [channel,setChannel]=useState(dualOtp?'both':!smsReady&&whatsapp?'whatsapp':'sms')
  const [phoneState, requestAction] = useActionState(requestOtp, empty)
  const [verifyState, verifyAction] = useActionState(verifyOtp, empty)

  /* Once a code has been issued we swap to the verification step. */
  const phone = phoneState.phone
  const stage: 'phone' | 'code' = phoneState.phone && phoneState.notice ? 'code' : 'phone'

  if (stage === 'code' && phone) {
    return (
      <VerifyStep
        key={phoneState.issuedAt}
        action={verifyAction}
        resendAction={requestAction}
        state={{...verifyState,error:phoneState.error??(verifyState.phone&&verifyState.phone!==phone?undefined:verifyState.error)}}
        channel={phoneState.channel??'sms'}
        notice={phoneState.notice}
        phone={phone}
        otpHint={phoneState.otpHint}
        next={next}
      />
    )
  }

  return (
    <form action={requestAction} className="mt-8 space-y-5">
      {setupNotice&&!whatsapp&&<p role="status" className="rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning">{setupNotice}</p>}
      <fieldset className="min-w-0"><legend className="font-semibold">Receive your sign-in code</legend><div className="mt-3 flex flex-wrap gap-4">{dualOtp&&<label className="flex min-h-11 items-center gap-2"><input name="channel" type="radio" value="both" checked={channel==='both'} onChange={()=>setChannel('both')}/>SMS and WhatsApp</label>}<label className="flex min-h-11 items-center gap-2"><input name="channel" type="radio" value="sms" checked={channel==='sms'} onChange={()=>setChannel('sms')} disabled={!smsReady}/>{localDemo?'Local demo code':smsReady?'SMS':'SMS (setup required)'}</label><label className="flex min-h-11 items-center gap-2"><input name="channel" type="radio" value="whatsapp" checked={channel==='whatsapp'} onChange={()=>setChannel('whatsapp')} disabled={!whatsapp}/>WhatsApp{!whatsapp&&' (setup required)'}</label></div></fieldset>
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
            placeholder="9876543210"
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

      <Submit label="Send code" pending="Sending…" disabled={!smsReady&&!whatsapp} />

      {google && (
        <>
          <div className="flex items-center gap-4 pt-1">
            <span className="h-px flex-1 bg-border" />
            <span className="text-sm text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          {/* A plain link, not a fetch: the OAuth handshake is a series of
              browser redirects and has to leave the page. */}
          <a
            href={`/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ''}`}
            className="flex min-h-14 w-full items-center justify-center gap-3 rounded-lg border border-input bg-background font-semibold transition-colors hover:bg-muted"
          >
            <GoogleMark />
            Continue with Google
          </a>
        </>
      )}
    </form>
  )
}

/** Google's mark, inlined — an external stylesheet or image would not load. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.1z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.2-2.9.7-4.2v-5.7H4.5C3 17 2.1 20.4 2.1 24s.9 7 2.4 9.9l7.3-5.7z" />
      <path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.1 29.9 2 24 2 15.4 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9 12.2-9z" />
    </svg>
  )
}

function VerifyStep({
  action,
  resendAction,
  state,
  phone,
  otpHint,
  next,
  channel,
  notice,
}: {
  action: (formData: FormData) => void
  resendAction:(formData:FormData)=>void
  state: ActionState
  phone: string
  otpHint?: string
  next?: string
  channel:string
  notice?:string
}) {
  const [code, setCode] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [cooldown,setCooldown]=useState(60)
  useEffect(()=>{const timer=setInterval(()=>setCooldown(value=>Math.max(0,value-1)),1000);return()=>clearInterval(timer)},[])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <form action={action} className="mt-8 space-y-5">
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="next" value={next ?? ''} />
      <input type="hidden" name="channel" value={channel}/>

      <div>
        <label htmlFor="code" className="block font-semibold">
          Enter the 6-digit code
        </label>
        <p className="mt-1 text-sm text-muted-foreground">
          {otpHint?'Local code for':channel==='whatsapp'?'WhatsApp code requested for':'Code requested for'} +91 {phone.slice(0, 5)} {phone.slice(5)}
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
            Local demonstration only. No phone message was sent. Your code is:{' '}
            <strong className="font-mono text-base">{otpHint}</strong>
          </span>
        </p>
      )}
      {!otpHint&&notice&&<p role="status" className="text-sm text-muted-foreground">{notice}</p>}

      {state.error && (
        <p role="alert" className="rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          {state.error}
        </p>
      )}

      <Submit label="Verify and continue" pending="Verifying…" />
      <button type="submit" formAction={resendAction} formNoValidate disabled={cooldown>0} className="min-h-11 w-full text-sm font-semibold text-primary disabled:opacity-50">{cooldown>0?`Resend code in ${cooldown}s`:'Resend code'}</button>

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

function Submit({ label, pending, disabled=false }: { label: string; pending: string; disabled?:boolean }) {
  const status = useFormStatus()
  return (
    <button
      type="submit"
      disabled={status.pending||disabled}
      className="min-h-14 w-full rounded-lg bg-cta font-semibold text-cta-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {status.pending ? pending : label}
    </button>
  )
}
