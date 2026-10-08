'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Menu, PawPrint, X } from 'lucide-react'
import { AccountMenu, AuthButtons } from './account-menu'
import { Logo } from './logo'
import { ThemeToggle } from './theme-toggle'

const navLinks = [
  { href: '/search', label: 'Find doctors' },
  { href: '/search?video=1', label: 'Video consultation' },
  { href: '/pets', label: 'Pet care' },
  { href: '/help', label: 'Help' },
]
export function SiteHeader() {
  const path = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [account, setAccount] = useState<{ name: string; phone: string | null; role?: string } | null | undefined>(undefined)
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/me').then(r => r.json()).then(data => { if (!cancelled) setAccount(data.user ?? null) }).catch(() => { if (!cancelled) setAccount(null) })
    return () => { cancelled = true }
  }, [])
  useEffect(() => { setMobileOpen(false) }, [path])
  useEffect(() => {
    function onKey(event: KeyboardEvent) { if (event.key === 'Escape') setMobileOpen(false) }
    function onClick(event: MouseEvent) { if (!root.current?.contains(event.target as Node)) setMobileOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick) }
  }, [])
  return <header ref={root} className="relative z-50 border-b border-border bg-card">
    <div className="care-container flex min-h-20 items-center justify-between gap-3 py-3">
      <Logo />
      <nav aria-label="Main navigation" className="hidden items-center gap-1 lg:flex">{navLinks.map(({ href, label }) => <Link key={href} href={href} className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 text-sm font-medium hover:bg-soft ${path === href ? 'text-primary' : 'text-muted-foreground'}`}>{href === '/pets' && <PawPrint className="size-4" />}{label}</Link>)}</nav>
      <div className="flex items-center gap-2">
        <Link href="/for-providers" className="mr-2 hidden text-xs font-semibold text-muted-foreground xl:inline">For providers</Link>
        <ThemeToggle />
        <div className="hidden sm:flex">{account === undefined ? <span aria-hidden="true" className="h-11 w-24 animate-pulse rounded-xl bg-muted" /> : account ? <AccountMenu name={account.name} phone={account.phone} role={account.role} /> : <AuthButtons />}</div>
        <button type="button" onClick={() => setMobileOpen(!mobileOpen)} aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileOpen} aria-controls="mobile-header-menu" className="inline-flex size-11 items-center justify-center rounded-full border border-border lg:hidden">{mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}</button>
      </div>
    </div>
    {mobileOpen && <nav id="mobile-header-menu" aria-label="More navigation" className="border-t border-border bg-card px-4 py-3 lg:hidden">
      {navLinks.map(({ href,label }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} className="block rounded-xl px-3 py-3 text-sm font-medium hover:bg-soft">{label}</Link>)}
      <Link href="/labs" className="block rounded-xl px-3 py-3 text-sm font-medium hover:bg-soft">Lab tests</Link>
      <Link href="/surgeries" className="block rounded-xl px-3 py-3 text-sm font-medium hover:bg-soft">Planned surgery</Link>
      <Link href="/for-providers" className="block rounded-xl px-3 py-3 text-sm font-medium hover:bg-soft">For doctors and clinics</Link>
      <div className="mt-2 flex gap-2 border-t border-border pt-3">{account ? <AccountMenu name={account.name} phone={account.phone} role={account.role} /> : <><Link href="/sign-in" className="care-button">Log in</Link><Link href="/sign-up" className="flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold">Create account</Link></>}</div>
    </nav>}
  </header>
}
