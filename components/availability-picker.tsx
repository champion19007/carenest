'use client'
import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight, CalendarDays } from 'lucide-react'
import { groupByDay, slotTime, type SlotOption } from '@/lib/slot-format'

export function AvailabilityPicker({ slug, slots }: { slug: string; slots: SlotOption[] }) {
  const days = groupByDay(slots)
  const [day, setDay] = useState(days[0]?.day ?? '')
  const [selected, setSelected] = useState('')
  const shown = days.find(item => item.day === day)
  return <section id="availability" className="profile-anchor rounded-[1.5rem] border border-border bg-card p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3"><h2 className="text-xl">Availability</h2><span className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="size-4" /> India time (IST)</span></div>
    {days.length ? <><p className="mt-4 text-sm font-medium">Choose a date</p><div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">{days.map(entry => <button type="button" key={entry.day} aria-pressed={day === entry.day} onClick={() => { setDay(entry.day); setSelected('') }} className={`min-h-16 shrink-0 rounded-2xl border px-4 text-sm font-semibold ${day === entry.day ? 'border-cta bg-cta text-white' : 'border-border bg-surface hover:border-primary'}`}>{entry.day}<span className="mt-1 block text-[10px] font-normal opacity-80">{entry.slots.length} times</span></button>)}</div>
    <p className="mt-5 text-sm font-medium">Choose a time</p><div className="mt-3 flex flex-wrap gap-2">{shown?.slots.map(slot => <button key={slot.slotId} type="button" aria-pressed={selected === slot.slotId} onClick={() => setSelected(slot.slotId)} className={`min-h-11 rounded-xl border px-4 text-xs font-semibold ${selected === slot.slotId ? 'border-cta bg-cta text-white' : 'border-border hover:border-primary'}`}>{slotTime(slot.startsAt)}</button>)}</div></> : <p className="mt-4 text-sm leading-7 text-muted-foreground">Open the booking calendar to check this doctor’s appointment times.</p>}
    <Link href={`/book/${slug}${selected ? `?slot=${encodeURIComponent(selected)}` : ''}`} className="care-button mt-6 w-full">{selected ? 'Continue with this time' : 'Open booking calendar'}<ArrowRight className="size-4" /></Link>
    <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">Availability is checked again when you submit your request.</p>
  </section>
}
