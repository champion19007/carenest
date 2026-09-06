import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { HelpBreadcrumb, HelpFooter, HelpHero } from '@/components/help-chrome'
import { helpCollections } from '@/lib/data'

export function generateStaticParams() {
  return helpCollections.map(({ slug }) => ({ collection: slug }))
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ collection: string }>
}) {
  const { collection: slug } = await params
  const collection = helpCollections.find((item) => item.slug === slug)
  if (!collection) notFound()

  return (
    <main className="min-h-screen bg-background">
      <HelpHero />
      <HelpBreadcrumb trail={[{ label: 'Help centre', href: '/help' }, { label: collection.title }]} />

      <section className="mx-auto max-w-[1100px] px-5 pb-14 lg:px-8">
        <span className="mt-8 flex size-14 items-center justify-center rounded-xl bg-soft text-2xl">
          {collection.emoji}
        </span>
        <h1 className="mt-5 text-3xl font-extrabold sm:text-4xl">{collection.title}</h1>
        <p className="mt-2 text-muted-foreground">{collection.articles.length} articles</p>

        <div className="mt-8 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {collection.articles.map((article) => (
            <Link
              key={article.slug}
              href={`/help/${collection.slug}/${article.slug}`}
              className="flex items-center justify-between gap-6 px-6 py-5 transition-colors hover:bg-muted"
            >
              <span>
                <span className="block font-semibold">{article.title}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{article.blurb}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </section>

      <HelpFooter />
    </main>
  )
}
