'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, MapPin, Menu, PawPrint, Phone, X } from 'lucide-react'
import { browseMenu, cities } from '@/lib/data'
import { AccountMenu, AuthButtons } from './account-menu'
import { Logo } from './logo'
import { ThemeToggle } from './theme-toggle'

const navLinks: { href: string; label: string; Icon?: typeof PawPrint }[] = [
  { href: '/search', label: 'Doctors' },
  { href: '/labs', label: 'Lab tests' },
  { href: '/surgeries', label: 'Surgeries' },
  { href: '/pets', label: 'Pet care', Icon: PawPrint },
  { href: '/help', label: 'Help' },
]

/**
 * Two-tier header: a slim brand strip carrying the city picker, helpline and
 * theme switch, above the main navigation.
 */
export function SiteHeader() {
  const [open, setOpen] = useState<'browse' | 'city' | null>(null)
  const [city, setCity] = useState('Navi Mumbai')
  const [mobileOpen, setMobileOpen] = useState(false)
  /* `undefined` while the session is still being read, so the header doesn't
     flash "Log in" at someone who is already signed in. */
  const [account, setAccount] = useState<{ name: string; phone: string } | null | undefined>(
    undefined,
  )
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/me')
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setAccount(data.user ?? null)
      })
      .catch(() => {
        if (!cancelled) setAccount(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(null)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(null)
        setMobileOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return (
    <header ref={root} className="relative z-50">
      {/* Announcement bar */}
      <div className="bg-accent text-accent-foreground">
        <p className="mx-auto max-w-[1320px] px-5 py-2 text-center text-sm font-semibold lg:px-8">
          Free home sample collection on lab tests above ₹999
        </p>
      </div>

      {/* Top strip — city, helpline, theme switch */}
      <div className="bg-banner text-banner-foreground">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-3 px-5 py-2 text-sm lg:px-8">
          <div className="relative">
            <button
              type="button"
              aria-expanded={open === 'city'}
              onClick={() => setOpen(open === 'city' ? null : 'city')}
              className="inline-flex items-center gap-2 rounded-md px-2 py-1 font-medium hover:bg-banner-foreground/10"
            >
              <MapPin className="size-4" />
              {city}
              <ChevronDown
                className={`size-3.5 transition-transform ${open === 'city' ? 'rotate-180' : ''}`}
              />
            </button>
            {open === 'city' && (
              <div className="absolute left-0 top-full mt-2 grid w-[min(30rem,90vw)] grid-cols-2 gap-1 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl sm:grid-cols-3">
                {cities.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setCity(item)
                      setOpen(null)
                    }}
                    className={`rounded-lg px-3 py-2 text-left text-sm hover:bg-muted ${
                      item === city ? 'font-semibold text-primary' : ''
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-5">
            <a
              href="tel:+911800123456"
              className="hidden items-center gap-2 font-medium hover:underline sm:inline-flex"
            >
              <Phone className="size-4" />
              1800-123-456
            </a>
            <Link
              href="/for-providers"
              className="hidden font-medium hover:underline md:inline"
            >
              For doctors &amp; clinics
            </Link>
            <Link href="/practice/patients" className="hidden font-medium hover:underline lg:inline">
              Clinic login
            </Link>
            <ThemeToggle onBanner />
          </div>
        </div>
      </div>

      {/* Main navigation */}
      <div className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-4 px-5 py-3 lg:px-8">
          <Logo />

          <nav className="hidden items-center gap-1 lg:flex">
            <div className="relative">
              <button
                type="button"
                aria-expanded={open === 'browse'}
                onClick={() => setOpen(open === 'browse' ? null : 'browse')}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 font-medium hover:bg-muted"
              >
                Browse
                <ChevronDown
                  className={`size-4 transition-transform ${open === 'browse' ? 'rotate-180' : ''}`}
                />
              </button>
              {open === 'browse' && (
                <div className="absolute left-0 top-full mt-2 w-72 rounded-xl border border-border bg-popover p-2 shadow-xl">
                  {browseMenu.map((item) => (
                    <Link
                      key={item}
                      href="/search"
                      onClick={() => setOpen(null)}
                      className="block rounded-lg px-4 py-2.5 font-medium hover:bg-muted"
                    >
                      {item}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {navLinks.map(({ href, label, Icon }) => (
              <Link
                key={label}
                href={href}
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 font-medium hover:bg-muted"
              >
                {Icon && <Icon className="size-4" />}
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {account === undefined ? (
              <span
                aria-hidden="true"
                className="h-11 w-28 animate-pulse rounded-lg bg-muted"
              />
            ) : account ? (
              <AccountMenu name={account.name} phone={account.phone} />
            ) : (
              <AuthButtons />
            )}
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen}
              className="inline-flex size-11 items-center justify-center rounded-lg border border-border lg:hidden"
            >
              {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="border-t border-border bg-background px-5 py-3 lg:hidden">
            {navLinks.map(({ href, label }) => (
              <Link
                key={label}
                href={href}
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-3 py-3 font-medium hover:bg-muted"
              >
                {label}
              </Link>
            ))}
            {browseMenu.map((item) => (
              <Link
                key={item}
                href="/search"
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-3 py-3 font-medium hover:bg-muted"
              >
                {item}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  )
}
