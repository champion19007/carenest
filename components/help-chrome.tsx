import Link from 'next/link'
import { Search } from 'lucide-react'
import { Logo } from './logo'
import { ThemeToggle } from './theme-toggle'

/** Navy (violet in dark) Help Centre masthead with the article search field. */
export function HelpHero({ heading }: { heading?: string }) {
  return (
    <>
      <div className="bg-banner text-banner-foreground">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-5 py-5 lg:px-8">
          <Logo onDark />
          <nav className="flex items-center gap-4">
            <Link href="/" className="font-medium hover:underline">
              Home
            </Link>
            <Link href="/help" className="font-medium hover:underline">
              Contact us
            </Link>
            <ThemeToggle compact />
          </nav>
        </div>
        <div className="mx-auto max-w-[1100px] px-5 pb-14 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-banner-muted">
            Help centre
          </p>
          <label className="mt-4 flex items-center gap-3 rounded-xl bg-background px-5 py-4 text-foreground">
            <Search className="size-5 shrink-0 text-muted-foreground" />
            <input
              placeholder="Search for articles — booking, refunds, cashless…"
              aria-label="Search help articles"
              className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>
      </div>
      {heading && (
        <div className="mx-auto max-w-[1100px] px-5 pt-12 lg:px-8">
          <h1 className="text-3xl font-extrabold sm:text-4xl">{heading}</h1>
        </div>
      )}
    </>
  )
}

export function HelpBreadcrumb({ trail }: { trail: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mx-auto max-w-[1100px] px-5 pt-10 lg:px-8">
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {trail.map(({ label, href }, index) => (
          <li key={label} className="flex items-center gap-2">
            {index > 0 && <span className="text-muted-foreground">›</span>}
            {href ? (
              <Link href={href} className="text-primary hover:underline">
                {label}
              </Link>
            ) : (
              <span className="text-muted-foreground">{label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function HelpFooter() {
  return (
    <footer className="border-t border-border px-5 py-10 text-center lg:px-8">
      <Link href="/" className="font-semibold text-primary hover:underline">
        Back to CareNest
      </Link>
    </footer>
  )
}
