import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { HelpBreadcrumb, HelpFooter, HelpHero } from '@/components/help-chrome'
import { helpCollections } from '@/lib/data'

export function generateStaticParams() {
  return helpCollections.flatMap((collection) =>
    collection.articles.map((article) => ({
      collection: collection.slug,
      article: article.slug,
    })),
  )
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ collection: string; article: string }>
}) {
  const { collection: collectionSlug, article: articleSlug } = await params
  const collection = helpCollections.find((item) => item.slug === collectionSlug)
  const article = collection?.articles.find((item) => item.slug === articleSlug)
  if (!collection || !article) notFound()

  const related = collection.articles.filter((item) => item.slug !== article.slug).slice(0, 4)

  return (
    <main className="min-h-screen bg-background">
      <HelpHero />
      <HelpBreadcrumb
        trail={[
          { label: 'Help centre', href: '/help' },
          { label: collection.title, href: `/help/${collection.slug}` },
          { label: article.title },
        ]}
      />

      <article className="mx-auto max-w-[1100px] px-5 pb-14 lg:px-8">
        <div className="max-w-3xl">
          <h1 className="mt-8 text-3xl font-extrabold leading-tight sm:text-4xl">{article.title}</h1>
          <p className="mt-3 text-lg text-muted-foreground">{article.blurb}</p>
          <p className="mt-4 text-sm text-muted-foreground">Updated {article.date}</p>

          <div className="mt-9 space-y-5 text-[1.05rem] leading-8">
            {article.body.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
          </div>

          <div className="mt-10 rounded-xl border border-border bg-surface px-6 py-8 text-center">
            <p className="font-semibold">Was this article helpful?</p>
            <div className="mt-4 flex justify-center gap-3">
              <button
                type="button"
                className="min-h-11 rounded-lg border border-border bg-card px-6 font-semibold hover:border-primary"
              >
                Yes
              </button>
              <button
                type="button"
                className="min-h-11 rounded-lg border border-border bg-card px-6 font-semibold hover:border-primary"
              >
                No
              </button>
            </div>
          </div>

          {related.length > 0 && (
            <>
              <h2 className="mt-12 text-2xl font-extrabold">Related articles</h2>
              <div className="mt-5 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {related.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/help/${collection.slug}/${item.slug}`}
                    className="flex items-center justify-between gap-6 px-6 py-4 transition-colors hover:bg-muted"
                  >
                    <span className="font-medium">{item.title}</span>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </article>

      <HelpFooter />
    </main>
  )
}
