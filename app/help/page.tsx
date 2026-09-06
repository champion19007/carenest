import Link from 'next/link'
import { HelpFooter, HelpHero } from '@/components/help-chrome'
import { helpCollections } from '@/lib/data'

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-background">
      <HelpHero heading="How can we help?" />

      <section className="mx-auto max-w-[1100px] px-5 py-10 lg:px-8">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {helpCollections.map(({ slug, title, emoji, articles }) => (
            <Link
              key={slug}
              href={`/help/${slug}`}
              className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary"
            >
              <span className="flex size-12 items-center justify-center rounded-xl bg-soft text-2xl" aria-hidden="true">
                {emoji}
              </span>
              <h2 className="mt-5 text-lg font-bold">{title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{articles.length} articles</p>
            </Link>
          ))}
        </div>

        <div className="mt-12 grid gap-5 rounded-xl border border-border bg-surface p-8 sm:grid-cols-2">
          <div>
            <h2 className="text-xl font-bold">Still need help?</h2>
            <p className="mt-2 leading-7 text-muted-foreground">
              Our support team replies within 24 hours, in English and Hindi.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            <a
              href="tel:+911800123456"
              className="inline-flex min-h-12 items-center rounded-lg bg-cta px-6 font-semibold text-cta-foreground"
            >
              Call 1800-123-456
            </a>
            <a
              href="mailto:support@carenest.in"
              className="inline-flex min-h-12 items-center rounded-lg border border-primary px-6 font-semibold text-primary"
            >
              Email us
            </a>
          </div>
        </div>
      </section>

      <HelpFooter />
    </main>
  )
}
