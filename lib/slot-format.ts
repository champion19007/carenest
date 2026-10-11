/**
 * Slots are instants; these format them as Indian wall time with an explicit
 * timezone, so a server abroad and a phone in Pune agree on which day it is.
 */

const IST = 'Asia/Kolkata'

const timeFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

const dayFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

/** The calendar date in IST, as YYYY-MM-DD, for grouping. */
function istDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function slotTime(iso: string): string {
  return timeFormat.format(new Date(iso))
}

/** "Today" / "Tomorrow" where it helps, otherwise "Tue, 9 Sep". */
export function slotDay(iso: string, now = new Date()): string {
  const key = istDateKey(new Date(iso))
  if (key === istDateKey(now)) return 'Today'
  if (key === istDateKey(new Date(now.getTime() + 86_400_000))) return 'Tomorrow'
  return dayFormat.format(new Date(iso))
}

/** A read-time display label; appointment storage keeps the underlying instant. */
export function slotLabel(iso: string, now = new Date()): string {
  return `${slotDay(iso, now)}, ${slotTime(iso)}`
}

export type SlotOption = { slotId: string; startsAt: string }

/** Slots grouped into the days they fall on, in order. */
export function groupByDay(
  slots: SlotOption[],
  now = new Date(),
): { day: string; slots: SlotOption[] }[] {
  const days: { day: string; slots: SlotOption[] }[] = []

  for (const slot of slots) {
    const day = slotDay(slot.startsAt, now)
    const last = days[days.length - 1]
    if (last && last.day === day) last.slots.push(slot)
    else days.push({ day, slots: [slot] })
  }

  return days
}
