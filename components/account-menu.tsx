'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  CalendarClock,
  ChevronDown,
  FileText,
  LogOut,
  Stethoscope,
  UserRound,
} from 'lucide-react'
import { signOut } from '@/app/actions/auth'

/**
 * The menu differs by role because the destinations do. "My health" means
 * nothing to a clinician, whose account exists to run a practice.
 */
function linksFor(role: string) {
  if (role === 'doctor') {
    return [
      { href: '/practice/requests', label: 'Appointment requests', Icon: Stethoscope },
      { href: '/practice/patients', label: 'My practice', Icon: CalendarClock },
      { href: '/account/profile', label: 'Profile & details', Icon: UserRound },
    ]
  }
  return [
    { href: '/dashboard/patient', label: 'My health', Icon: CalendarClock },
    { href: '/account/profile', label: 'Profile & family', Icon: UserRound },
    { href: '/account', label: 'Records & bookings', Icon: FileText },
  ]
}

/** Signed-in menu. Replaces the Login / Sign up pair once a session exists. */
export function AccountMenu({
  name,
  phone,
  role = 'patient',
}: {
  name: string
  phone: string
  role?: string
}) {
  const links = linksFor(role)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const label = name || (phone ? `+91 ${phone}` : 'Your account')
  /* Digits from a phone number are not initials, so fall back to an icon. */
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 font-medium hover:bg-muted"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-soft text-xs font-bold text-primary">
          {initials || <UserRound className="size-4" aria-hidden="true" />}
        </span>
        <span className="hidden max-w-[9rem] truncate sm:inline">{label}</span>
        <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-60 overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate font-semibold">{name || 'Your account'}</p>
            <p className="truncate text-sm text-muted-foreground">+91 {phone}</p>
          </div>

          {links.map(({ href, label: text, Icon }) => (
            <Link
              key={href}
              href={href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3 font-medium hover:bg-muted"
            >
              <Icon className="size-4 text-muted-foreground" />
              {text}
            </Link>
          ))}

          <form action={signOut} className="border-t border-border">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-3 px-4 py-3 font-medium text-warning hover:bg-warning/10"
            >
              <LogOut className="size-4" />
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

/** Shown when nobody is signed in. */
export function AuthButtons() {
  return (
    <>
      <Link
        href="/sign-in"
        className="hidden min-h-11 items-center rounded-lg border border-primary px-5 font-semibold text-primary transition-colors hover:bg-soft sm:inline-flex"
      >
        Log in
      </Link>
      <Link
        href="/sign-up"
        className="inline-flex min-h-11 items-center rounded-lg bg-cta px-5 font-semibold text-cta-foreground transition-opacity hover:opacity-90"
      >
        Sign up
      </Link>
    </>
  )
}

