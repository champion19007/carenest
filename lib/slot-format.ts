/**
 * Turning slot timestamps into something a patient recognises.
 *
 * Slots are stored as instants (TIMESTAMPTZ) and must be shown as Indian wall
 * time regardless of where the server or the reader happens to be. Formatting
 * with an explicit `Asia/Kolkata` timezone rather than the runtime default is
 * what makes a Vercel function in Washington and a phone in Pune agree on
 * which day "Today, 6:30 PM" refers to.
 *
 * No `server-only` import: the booking form is a client component and formats
 * the same values.
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

/** The label stored on the booking, so a past appointment still reads well. */
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
