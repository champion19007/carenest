import type { Metadata } from 'next'
import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { DiscoverySearch, SpecialtyChips } from '@/components/discovery-search'
import { SymptomRouting } from '@/components/symptom-routing'
import { routeSymptoms } from '@/lib/taxonomy'
import { DoctorResults } from '@/components/doctor-results'
import { NearbySuggestions } from '@/components/nearby-suggestions'
import {
  distinctSpecialities,
  neighbouringAreas,
  resolveArea,
  searchDoctors,
  type DoctorQuery,
} from '@/lib/db/sql'
import { languages } from '@/lib/data'

export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const params = await searchParams
  const raw = typeof params.area === 'string' ? params.area : ''
  const area = raw ? await resolveArea(raw) : undefined

  const title = area
    ? `Doctors in ${area.name}, ${area.city} (${area.pin_code})`
    : 'Find doctors near you'

  return {
    title: `${title} · CareNest`,
    description: area
      ? `Doctors practising in ${area.name} (${area.pin_code}). Compare fees, experience and languages before you book.`
      : 'Browse doctors by area, speciality, fee and language. Consultation fees shown upfront — no account needed to look.',
    alternates: { canonical: area ? `/search?area=${area.pin_code}` : '/search' },
  }
}

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return []
  return Array.isArray(value) ? value : value.split(',').filter(Boolean)
}

const FEE_BANDS: Record<string, [number | undefined, number | undefined]> = {
  'Under ₹500': [undefined, 499],
  '₹500 - ₹800': [500, 800],
  '₹800 - ₹1200': [800, 1200],
  '₹1200+': [1200, undefined],
}

const EXPERIENCE_BANDS: Record<string, [number | undefined, number | undefined]> = {
  '0-5 years': [0, 5],
  '5-10 years': [5, 10],
  '10+ years': [10, undefined],
  '15+ years': [15, undefined],
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams

  const rawArea = typeof params.area === 'string' ? params.area.trim() : ''
  /* Step 1 — resolve whatever was typed to a known area, by indexed lookup. */
  const area = rawArea ? await resolveArea(rawArea) : undefined

  /* What was typed, if it reads like a complaint rather than a place. Pure
     table lookup — no model, no network, no key. */
  const symptomText = typeof params.q === 'string' ? params.q.trim() : ''
  const routing = process.env.ENABLE_SYMPTOM_ROUTING==='1' && symptomText ? routeSymptoms(symptomText) : null

  const fees = typeof params.fees === 'string' ? params.fees : ''
  const experience = typeof params.experience === 'string' ? params.experience : ''
  const [minFee, maxFee] = FEE_BANDS[fees] ?? []
  const [minExperience, maxExperience] = EXPERIENCE_BANDS[experience] ?? []

  const query: DoctorQuery = {
    kind: 'human',
    pinCode: area?.pin_code,
    text: routing?.specialities.length ? undefined : symptomText || undefined,
    /* An explicit filter always wins — the suggestion only fills the gap when
       the patient has not said who they want to see. */
    specialities: toArray(params.speciality).length
      ? toArray(params.speciality)
      : (routing?.specialities ?? []),
    languages: toArray(params.language),
    minFee,
    maxFee,
    minExperience,
    maxExperience,
    video: params.video === '1',
    cashless: params.cashless === '1',
    femaleOnly: params.female === '1',
    sort: (params.sort as DoctorQuery['sort']) ?? 'relevance',
    limit:31,
    offset:(Math.min(333,Math.max(1,Number(params.page)||1))-1)*30,
  }

  /* Step 2 — the primary query. */
  const matches = rawArea && !area ? [] : await searchDoctors(query)
  const doctors=matches.slice(0,30)

  /* Step 3 — the fork. Only fall back when an area was actually asked for. */
  const showFallback = Boolean(rawArea) && doctors.length === 0
  const suggestions = showFallback && area ? await neighbouringAreas(area.locality_id, 'human',2,query) : []

  /* Carry the other filters across so a suggestion chip doesn't reset them. */
  const preserved = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key === 'area' || typeof value !== 'string') continue
    preserved.set(key, value)
  }
  const preservedQuery = preserved.toString() ? `&${preserved.toString()}` : ''

  const specialities = await distinctSpecialities('human')

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />

      <div className="discovery-hero border-b border-border">
        <div className="mx-auto max-w-[1320px] px-5 py-8 lg:px-8">
          <p className="eyebrow">Find a doctor</p>
          <h1 className="mt-3 text-3xl sm:text-4xl">
            {area ? `Doctors in ${area.name}` : 'Doctors near you'}
          </h1>

          {area ? (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground">
              <MapPin className="size-4 text-primary" />
              {area.name}, {area.city} · PIN {area.pin_code}
            </p>
          ) : (
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">Find a doctor by name, specialty, area or PIN code. Compare consultation fees before you book.</p>
          )}

          <div className="mt-6 max-w-3xl">
            <DiscoverySearch key={`${symptomText}|${rawArea}`} defaultQuery={symptomText} defaultArea={rawArea} />
          </div>
          <div className="mt-5"><SpecialtyChips /></div>
        </div>
      </div>

      {routing && (
        <div className="mx-auto max-w-[1320px] px-5 pt-8 lg:px-8">
          <SymptomRouting routing={routing} query={symptomText} />
        </div>
      )}

      {showFallback ? (
        <div className="mx-auto max-w-[1320px] px-5 py-10 lg:px-8">
          <NearbySuggestions
            area={area}
            rawInput={rawArea}
            suggestions={suggestions}
            preservedQuery={preservedQuery}
          />
        </div>
      ) : (
        <DoctorResults
          doctors={doctors}
          specialities={specialities}
          languages={languages}
          initial={{
            specialities: query.specialities ?? [],
            languages: query.languages ?? [],
            fees,
            experience,
            video: Boolean(query.video),
            cashless: Boolean(query.cashless),
            femaleOnly: Boolean(query.femaleOnly),
            sort: query.sort ?? 'relevance',
          }}
        />
      )}

      {(matches.length>30||Number(params.page)>1)&&<nav aria-label="Result pages" className="care-container flex gap-4 py-6">{Number(params.page)>1&&<Link className="care-button" href={`/search?${new URLSearchParams({...Object.fromEntries(preserved),page:String(Math.max(1,(Number(params.page)||1)-1)),...(rawArea?{area:rawArea}:{})})}`}>Previous page</Link>}{matches.length>30&&<Link className="care-button" href={`/search?${new URLSearchParams({...Object.fromEntries(preserved),page:String((Number(params.page)||1)+1),...(rawArea?{area:rawArea}:{})})}`}>Next page</Link>}</nav>}
      <SiteFooter />
    </main>
  )
}
