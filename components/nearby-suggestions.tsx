import Link from 'next/link'
import { ArrowRight, MapPin, SearchX } from 'lucide-react'
import type { AreaSuggestion, Locality } from '@/lib/db/sql'

/**
 * The empty state.
 *
 * Rather than showing a blank result list, the pre-authored neighbours of the
 * searched area are offered as chips. Each chip carries its doctor count, and
 * areas with none were already filtered out server-side — so a chip never
 * leads to a second empty page.
 */
export function NearbySuggestions({
  area,
  rawInput,
  suggestions,
  preservedQuery,
}: {
  area?: Locality
  rawInput: string
  suggestions: AreaSuggestion[]
  /** Existing filters, carried across so a chip doesn't reset them. */
  preservedQuery: string
}) {
  const unknownArea = !area

  return (
    <div className="rounded-xl border border-dashed border-border p-8 sm:p-10">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchX className="size-6" />
      </span>

      <h2 className="mt-5 text-2xl">
        {unknownArea
          ? `We don’t cover “${rawInput}” yet`
          : `No doctors in ${area.name} right now`}
      </h2>

      <p className="mt-3 max-w-xl leading-8 text-muted-foreground">
        {unknownArea ? (
          <>
            That PIN code or area name isn’t in our registry. Try one of the areas below, or check
            the spelling — we also accept a 6-digit PIN code.
          </>
        ) : (
          <>
            We know {area.name} ({area.pin_code}), but no verified doctor has listed a clinic there
            yet. These neighbouring areas do have availability.
          </>
        )}
      </p>

      {suggestions.length > 0 ? (
        <>
          <p className="mt-7 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Nearby areas with doctors
          </p>
          <ul className="mt-3 flex flex-wrap gap-3">
            {suggestions.map((suggestion) => (
              <li key={suggestion.pin_code}>
                <Link
                  href={`/search?area=${encodeURIComponent(suggestion.pin_code)}${preservedQuery}`}
                  className="inline-flex items-center gap-3 rounded-full border border-border bg-card py-2 pl-4 pr-3 font-medium transition-colors hover:border-primary hover:bg-soft"
                >
                  <MapPin className="size-4 shrink-0 text-primary" />
                  <span>
                    {suggestion.name}
                    <span className="ml-2 text-sm text-muted-foreground">
                      {suggestion.pin_code}
                    </span>
                  </span>
                  <span className="rounded-full bg-soft px-2.5 py-0.5 text-sm font-bold text-primary">
                    {suggestion.doctor_count}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            The number on each chip is how many verified doctors practise there.
          </p>
        </>
      ) : (
        <p className="mt-7 rounded-lg bg-muted px-5 py-4 leading-7 text-muted-foreground">
          None of the neighbouring areas have a listed doctor either. Try a wider search, or{' '}
          <Link href="/search" className="font-semibold text-primary underline">
            browse every doctor
          </Link>
          .
        </p>
      )}

      <div className="mt-8 border-t border-border pt-6">
        <Link href="/search" className="font-semibold text-primary hover:underline">
          Clear the area filter and see all doctors →
        </Link>
      </div>
    </div>
  )
}
