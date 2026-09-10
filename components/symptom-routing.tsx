import Link from 'next/link'
import { Info, TriangleAlert } from 'lucide-react'
import type { Routing } from '@/lib/taxonomy'

/**
 * Why these specialities are being shown.
 *
 * Phrased throughout as a suggestion about *who to see*, never a statement
 * about what is wrong. "Symptoms like these are usually seen by" is a routing
 * claim we can stand behind; "you may have sciatica" is a diagnosis we cannot,
 * and the difference is the whole legal and ethical position of the feature.
 *
 * A red flag does not block the booking. Telling someone their symptoms may be
 * urgent and then refusing to let them book would leave them with nothing —
 * the emergency advice sits alongside the results, not in place of them.
 */
export function SymptomRouting({ routing, query }: { routing: Routing; query: string }) {
  if (routing.redFlag) {
    return (
      <div
        role="alert"
        className="mb-6 rounded-xl border border-warning/50 bg-warning/10 p-5"
      >
        <p className="flex items-center gap-2 font-bold text-warning">
          <TriangleAlert className="size-5 shrink-0" />
          This may need urgent care
        </p>
        <p className="mt-2 leading-7">
          {routing.because} If this is happening now, call{' '}
          <a href="tel:108" className="font-bold underline">
            108
          </a>{' '}
          for an ambulance or go to your nearest emergency department. Do not wait for an
          appointment.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          If it has already settled and you want to be checked, these are the doctors below:{' '}
          <span className="font-semibold text-foreground">
            {routing.specialities.join(', ')}
          </span>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="mb-6 rounded-xl border border-border bg-soft p-5">
      <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-primary">
        <Info className="size-4 shrink-0" />
        Suggested speciality
      </p>
      <p className="mt-2 leading-7">
        You searched <span className="font-semibold">“{query}”</span>. {routing.because} Symptoms
        like these are usually seen by a{' '}
        <span className="font-semibold text-foreground">
          {routing.specialities.join(' or a ')}
        </span>
        , so we have shown those first.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        This is a suggestion about which doctor to book, not a diagnosis.{' '}
        <Link href="/search" className="font-semibold text-primary hover:underline">
          Browse everyone instead
        </Link>
        .
      </p>
    </div>
  )
}
