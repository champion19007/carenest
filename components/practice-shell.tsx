'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  HelpCircle,
  Menu,
  Plug,
  Plus,
  Search,
  Settings,
  UsersRound,
  Wallet,
  X,
} from 'lucide-react'
import { Logo } from './logo'
import { ThemeToggle } from './theme-toggle'

const nav = [
  { href: '/practice/calendar', label: 'Calendar', Icon: CalendarDays },
  { href: '/practice/patients', label: 'Patients', Icon: UsersRound },
  { href: '/practice/reports', label: 'Reports', Icon: BarChart3 },
  { href: '/practice/billing', label: 'Billing', Icon: Wallet },
  { href: '/practice/integrations', label: 'Integrations', Icon: Plug },
  { href: '/practice/settings', label: 'Settings', Icon: Settings },
]

/**
 * Chrome for the clinic-side app: a persistent brand rail on the left and a
 * utility bar on top. Deliberately distinct from the patient site's header.
 */
export function PracticeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 shrink-0 overflow-y-auto bg-banner text-banner-foreground transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <Logo onDark />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="rounded-lg p-2 hover:bg-banner-foreground/10 lg:hidden"
          >
            <X className="size-5" />
          </button>
        </div>

        <p className="px-5 pb-2 pt-3 text-xs font-bold uppercase tracking-wider text-banner-muted">
          Sunrise Clinic · Kharghar
        </p>

        <nav className="px-3 pb-6">
          {nav.map(({ href, label, Icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={`mt-1 flex items-center gap-3 rounded-lg px-4 py-3 font-medium transition-colors ${
                  active
                    ? 'bg-banner-foreground text-banner'
                    : 'text-banner-muted hover:bg-banner-foreground/10 hover:text-banner-foreground'
                }`}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-banner-foreground/15 px-5 py-5">
          <Link href="/" className="text-sm text-banner-muted hover:text-banner-foreground">
            ← Back to carenest.in
          </Link>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background">
          <div className="flex items-center gap-3 px-4 py-3 lg:px-6">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
              className="rounded-lg border border-border p-2.5 lg:hidden"
            >
              <Menu className="size-5" />
            </button>

            <label className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 sm:max-w-md">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                placeholder="Search patients by name or number"
                aria-label="Search patients"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </label>

            <button
              type="button"
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-cta px-4 font-semibold text-cta-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">Add patient</span>
            </button>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <ThemeToggle compact />
              <button
                type="button"
                aria-label="Help"
                className="hidden size-11 items-center justify-center rounded-full border border-border sm:inline-flex"
              >
                <HelpCircle className="size-5" />
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold"
              >
                Dr. Deshmukh
                <ChevronDown className="size-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}

/** Shared page heading for the clinic screens. */
export function PracticeHeading({
  title,
  action,
}: {
  title: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-background px-4 py-5 lg:px-6">
      <div>
        <h1 className="text-2xl font-extrabold">{title}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Sunrise Clinic · Kharghar, Navi Mumbai</p>
      </div>
      {action}
    </div>
  )
}
