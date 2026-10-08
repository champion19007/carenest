'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Brain, HeartPulse, MapPin, Search, Smile, Sparkles, Stethoscope } from 'lucide-react'

export function DiscoverySearch({ defaultQuery = '', defaultArea = '' }: { defaultQuery?: string; defaultArea?: string }) {
  const router = useRouter()
  const [query, setQuery] = useState(defaultQuery)
  const [area, setArea] = useState(defaultArea)
  function submit(event: FormEvent) {
    event.preventDefault()
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (area.trim()) params.set('area', area.trim())
    router.push(`/search${params.size ? `?${params}` : ''}`)
  }
  return <form onSubmit={submit} role="search" className="discovery-search">
    <label className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 px-3"><Stethoscope className="size-4 shrink-0 text-muted-foreground" /><input aria-label="Doctor name, specialty or symptom" placeholder="Find the right doctor for you" value={query} onChange={e => setQuery(e.target.value)} className="min-w-0 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" /></label>
    <label className="flex min-h-12 min-w-0 items-center gap-2 border-t border-border px-3 sm:w-44 sm:border-l sm:border-t-0"><MapPin className="size-4 shrink-0 text-primary" /><input aria-label="Area or PIN code" placeholder="Area or PIN code" value={area} onChange={e => setArea(e.target.value)} className="min-w-0 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" /></label>
    <button type="submit" aria-label="Search doctors" className="care-button min-h-11 px-5"><Search className="size-4" /><span>Search</span></button>
  </form>
}

const specialties = [
  { label: 'General Physician', Icon: Stethoscope, color: 'specialty-blue' },
  { label: 'Cardiologist', Icon: HeartPulse, color: 'specialty-pink' },
  { label: 'Dermatologist', Icon: Sparkles, color: 'specialty-peach' },
  { label: 'Neurologist', Icon: Brain, color: 'specialty-purple' },
  { label: 'Dentist', Icon: Smile, color: 'specialty-teal' },
]
export function SpecialtyChips() {
  return <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-1">{specialties.map(({ label, Icon, color }) => <Link key={label} href={`/search?speciality=${encodeURIComponent(label)}`} className="specialty-chip"><span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${color}`}><Icon className="size-5" /></span><span>{label}</span></Link>)}</div>
}
