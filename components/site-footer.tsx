import Link from 'next/link'
import { Logo } from './logo'

const links = [
  { href: '/search', label: 'Find doctors' },
  { href: '/search?video=1', label: 'Video consultations' },
  { href: '/pets', label: 'Pet care' },
  { href: '/account', label: 'My appointments' },
  { href: '/for-providers', label: 'For doctors and clinics' },
  { href: '/help', label: 'Help centre' },
  { href: '/policies/privacy', label: 'Privacy' },
  { href: '/policies/terms', label: 'Terms' },
  { href: '/policies/cancellations', label: 'Cancellation & refunds' },
  { href: '/contact', label: 'Support & grievances' },
]
export function SiteFooter() {
  return <footer className="border-t border-border bg-card">
    <div className="care-container py-10">
      <div className="flex flex-col justify-between gap-7 sm:flex-row sm:items-start"><div><Logo /><p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">Care for you, your family, and your pets.<br />Find your next step with CareNest.</p></div><nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-3">{links.map(({ href,label }) => <Link key={href} href={href} className="text-xs text-muted-foreground hover:text-primary">{label}</Link>)}</nav></div>
      <div className="mt-8 flex flex-col justify-between gap-3 border-t border-border pt-5 text-xs leading-6 text-muted-foreground sm:flex-row"><p>© 2026 CareNest</p><p>For urgent medical care, contact your local emergency service or nearest hospital.</p></div>
    </div>
  </footer>
}
