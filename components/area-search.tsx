'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { FormEvent, useState, useTransition } from 'react'
import { MapPin, Search } from 'lucide-react'

/**
 * Area entry. A PIN code or a locality name — no map, no autocomplete call to
 * a geocoding service. The value is handed to the server, which resolves it
 * with an indexed string lookup.
 */
export function AreaSearch({ value, placeholder }: { value?: string; placeholder?: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const [area, setArea] = useState(value ?? '')
  const [pending, startTransition] = useTransition()

  function submit(event: FormEvent) {
    event.preventDefault()
    const next = new URLSearchParams(params.toString())
    if (area.trim()) next.set('area', area.trim())
    else next.delete('area')
    startTransition(() => router.push(`/search?${next.toString()}`, { scroll: false }))
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <label className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-input bg-card px-4 py-3">
        <MapPin className="size-5 shrink-0 text-primary" />
        <input
          value={area}
          onChange={(event) => setArea(event.target.value)}
          inputMode="text"
          aria-label="Area name or PIN code"
          placeholder={placeholder ?? 'Enter a PIN code or area — e.g. 401107 or Mira Road East'}
          className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-cta px-7 font-semibold text-cta-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <Search className="size-4" />
        {pending ? 'Searching…' : 'Search'}
      </button>
    </form>
  )
}
