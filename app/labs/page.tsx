import Link from 'next/link'
import { Clock, FlaskConical, Home, IndianRupee, ShieldCheck } from 'lucide-react'
import { Photo } from '@/components/photo'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { labPackages } from '@/lib/data'
import { photos } from '@/lib/images'

const assurances = [
  { Icon: Home, title: 'Free home collection', body: 'A trained phlebotomist visits you, 7 am to 9 pm.' },
  { Icon: ShieldCheck, title: 'NABL-accredited labs', body: 'Samples processed only at accredited partner labs.' },
  { Icon: Clock, title: 'Reports in 24 hours', body: 'Digital reports delivered to your CareNest account.' },
]

const popularTests = [
  { name: 'Complete Blood Count (CBC)', price: 299 },
  { name: 'HbA1c (Glycated Haemoglobin)', price: 449 },
  { name: 'Lipid Profile', price: 549 },
  { name: 'Liver Function Test (LFT)', price: 599 },
  { name: 'Kidney Function Test (KFT)', price: 649 },
  { name: 'Vitamin B12', price: 699 },
]

export default function LabsPage() {
  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />

      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1320px] px-5 py-12 lg:px-8">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_0.8fr]">
            <div>
              <h1 className="inline-flex items-center gap-3 text-3xl font-extrabold sm:text-4xl">
                <FlaskConical className="size-8 text-primary" />
                Lab tests at home
              </h1>
              <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
                Book a test or a full-body package, get your sample collected at home, and receive
                reports on your phone.
              </p>
            </div>
            {/* Where the sample actually ends up — the part of the service the
                patient never sees. */}
            <Photo
              photo={photos.lab}
              ratio={16 / 10}
              width={620}
              className="rounded-2xl shadow-lg"
            />
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {assurances.map(({ Icon, title, body }) => (
              <div key={title} className="rounded-xl border border-border bg-card p-5">
                <Icon className="size-6 text-primary" />
                <h2 className="mt-4 font-bold">{title}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1320px] px-5 py-12 lg:px-8">
        <h2 className="text-2xl font-extrabold">Health checkup packages</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {labPackages.map(({ name, tests, price, mrp }) => (
            <article key={name} className="flex flex-col rounded-xl border border-border bg-card p-5">
              <h3 className="text-lg font-bold leading-snug">{name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{tests} tests included</p>
              <div className="mt-5 flex items-baseline gap-2">
                <span className="inline-flex items-center text-2xl font-extrabold">
                  <IndianRupee className="size-5" />
                  {price}
                </span>
                <span className="text-sm text-muted-foreground line-through">₹{mrp}</span>
              </div>
              <button
                type="button"
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-cta font-semibold text-cta-foreground transition-opacity hover:opacity-90"
              >
                Book now
              </button>
            </article>
          ))}
        </div>

        <h2 className="mt-14 text-2xl font-extrabold">Popular individual tests</h2>
        <div className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {popularTests.map(({ name, price }) => (
            <div key={name} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
              <span className="font-medium">{name}</span>
              <div className="flex items-center gap-5">
                <span className="inline-flex items-center font-bold">
                  <IndianRupee className="size-4" />
                  {price}
                </span>
                <button
                  type="button"
                  className="min-h-10 rounded-lg border border-primary px-5 font-semibold text-primary transition-colors hover:bg-soft"
                >
                  Add
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          Need help choosing?{' '}
          <Link href="/search" className="font-semibold text-primary hover:underline">
            Consult a general physician
          </Link>{' '}
          before booking a package.
        </p>
      </section>

      <SiteFooter />
    </main>
  )
}
