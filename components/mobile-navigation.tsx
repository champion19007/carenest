'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, Home, PawPrint, Search, UserRound } from 'lucide-react'

const links = [
  { href: '/', label: 'Home', Icon: Home },
  { href: '/account', label: 'Visits', Icon: CalendarDays },
  { href: '/search', label: 'Find care', Icon: Search },
  { href: '/pets', label: 'Pets', Icon: PawPrint },
  { href: '/account/profile', label: 'Profile', Icon: UserRound },
]
export function MobileNavigation() {
  const path = usePathname()
  if (['/practice', '/admin', '/sign-in', '/sign-up', '/welcome'].some(prefix => path.startsWith(prefix))) return null
  return <nav aria-label="Mobile navigation" className="mobile-care-nav">{links.map(({ href, label, Icon }) => {
    const active = href === '/' ? path === '/' : href === '/search' ? path.startsWith('/search') || path.startsWith('/doctor') || path.startsWith('/book') : href === '/account' ? path === '/account' || path === '/dashboard/patient' : path.startsWith(href)
    return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`mobile-care-link ${href === '/search' ? 'mobile-care-search' : ''} ${active ? 'is-active' : ''}`}><Icon className="size-5" /><span>{label}</span></Link>
  })}</nav>
}
