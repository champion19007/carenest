'use client'

import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { MapPin, Search } from 'lucide-react'
import { serviceTabs, type ServiceTab } from '@/lib/data'

type Props = {
  /** `hero` is the tall landing treatment; `compact` sits in the results header. */
  variant?: 'hero' | 'compact'
  showTabs?: boolean
  defaultQuery?: string
  defaultLocality?: string
}

/**
 * Service tabs above the field row — the pattern Indian health apps use, and
 * a deliberate departure from a single undifferentiated search box.
 */
export function CareSearch({
  variant = 'hero',
  showTabs = true,
  defaultQuery = '',
  defaultLocality = 'Kharghar, Navi Mumbai',
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<ServiceTab>('doctors')
  const [query, setQuery] = useState(defaultQuery)
  const [locality, setLocality] = useState(defaultLocality)

  const hero = variant === 'hero'
  const active = serviceTabs.find((item) => item.id === tab) ?? serviceTabs[0]

  function submit(event: FormEvent) {
    event.preventDefault()
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (locality) params.set('near', locality)
    params.set('mode', tab)
    router.push(tab === 'labs' ? `/labs?${params}` : `/search?${params}`)
  }

  return (
    <div className="w-full text-left">
      {showTabs && (
        <div
          role="tablist"
          aria-label="What are you looking for?"
          className="no-scrollbar mb-4 flex gap-1 overflow-x-auto"
        >
          {serviceTabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`whitespace-nowrap rounded-t-lg border-b-[3px] px-4 py-2.5 text-sm font-semibold transition-colors ${
                tab === id
                  ? 'border-accent text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={submit}
        className={`flex w-full flex-col gap-2 rounded-xl border border-border bg-card p-2 sm:flex-row sm:items-center ${
          hero ? 'shadow-lg shadow-primary/5' : ''
        }`}
      >
        <label className="flex flex-1 items-center gap-2.5 rounded-lg px-3 py-2.5 sm:max-w-[16rem]">
          <MapPin className="size-5 shrink-0 text-primary" />
          <input
            value={locality}
            onChange={(event) => setLocality(event.target.value)}
            aria-label="Locality or city"
            placeholder="Locality or city"
            className="w-full bg-transparent font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground"
          />
        </label>

        <span className="hidden h-8 w-px bg-border sm:block" aria-hidden="true" />

        <label className="flex flex-1 items-center gap-2.5 rounded-lg px-3 py-2.5">
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={active.hint}
            placeholder={active.hint}
            className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </label>

        <button
          type="submit"
          className={`inline-flex items-center justify-center gap-2 rounded-lg bg-cta font-semibold text-cta-foreground transition-opacity hover:opacity-90 ${
            hero ? 'min-h-13 px-8' : 'min-h-12 px-6'
          }`}
        >
          <Search className="size-5 sm:hidden" />
          Search
        </button>
      </form>
    </div>
  )
}
