'use client'

import { useActionState, useState } from 'react'
import { BadgeCheck, ChevronDown, IndianRupee, Phone, ShieldCheck } from 'lucide-react'
import { Photo } from '@/components/photo'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { cities, surgeryAssurances, surgeryCategories } from '@/lib/data'
import { submitSurgeryLead, type LeadState } from '@/app/actions/leads'

const emptyLead: LeadState = {}
import { photos } from '@/lib/images'

export default function SurgeriesPage() {
  const [open, setOpen] = useState<string>('Popular')
  const [state, submit] = useActionState(submitSurgeryLead, emptyLead)
  const submitted = state.done === true

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />

      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:px-8">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-soft px-4 py-1.5 text-sm font-semibold text-primary">
              <ShieldCheck className="size-4" />
              Assured surgery care
            </span>
            <h1 className="mt-4 text-balance text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">
              Planned surgery, without the guesswork
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
              We match you with an experienced surgeon at a vetted hospital, give you the cost
              upfront, and handle the insurance paperwork.
            </p>

            <dl className="mt-8 grid gap-4 sm:grid-cols-2">
              {surgeryAssurances.map(({ title, body }) => (
                <div key={title} className="rounded-xl border border-border bg-card p-5">
                  <dt className="flex items-center gap-2 font-bold">
                    <BadgeCheck className="size-5 text-primary" />
                    {title}
                  </dt>
                  <dd className="mt-2 text-sm leading-6 text-muted-foreground">{body}</dd>
                </div>
              ))}
            </dl>

            {/* A theatre band rather than a portrait: the reassurance being
                offered is the setting and the team, not any one surgeon. */}
            <Photo
              photo={photos.theatre}
              ratio={21 / 9}
              width={900}
              scrim="strong"
              className="mt-8 rounded-2xl shadow-lg"
            >
              <div className="flex h-full flex-col justify-end p-6 sm:p-8">
                <p className="text-sm font-semibold uppercase tracking-wide text-white/80">
                  NABH-accredited partner hospitals
                </p>
                <p className="mt-1 max-w-md text-lg font-semibold leading-snug text-white sm:text-xl">
                  Your surgeon, theatre and admission date are confirmed before you pay anything.
                </p>
              </div>
            </Photo>
          </div>

          {/* Lead capture — the standard flow for surgery enquiries in India */}
          <aside className="rounded-xl border border-border bg-card p-6 lg:sticky lg:top-6 lg:self-start">
            <h2 className="text-xl font-bold">Book a free consultation</h2>
            <p className="mt-1.5 text-muted-foreground">A care coordinator calls you back in 15 minutes.</p>

            {submitted ? (
              <div
                role="status"
                className="mt-6 rounded-lg bg-success/10 px-5 py-6 text-center text-success"
              >
                <BadgeCheck className="mx-auto size-8" />
                <p className="mt-3 font-bold">Request received</p>
                <p className="mt-1 text-sm leading-6">
                  Our coordinator will call you shortly. Keep your reports handy if you have them.
                </p>
              </div>
            ) : (
              <form action={submit} className="mt-6 space-y-4">
                <label className="block">
                  <span className="font-semibold">Procedure</span>
                  <select
                    name="procedure"
                    required
                    className="mt-2 min-h-13 w-full rounded-lg border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Select a procedure</option>
                    {/* A procedure can sit in more than one category (Cataract is
                        both Popular and Ophthalmology), so de-duplicate by name. */}
                    {Array.from(
                      new Set(
                        surgeryCategories.flatMap(({ procedures }) =>
                          procedures.map(({ name }) => name),
                        ),
                      ),
                    ).map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="font-semibold">City</span>
                  <select
                    name="city"
                    required
                    className="mt-2 min-h-13 w-full rounded-lg border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
                  >
                    {cities.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="font-semibold">Name</span>
                  <input
                    name="name"
                    required
                    maxLength={80}
                    placeholder="Your full name"
                    className="mt-2 min-h-13 w-full rounded-lg border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>

                <label className="block">
                  <span className="font-semibold">Mobile number</span>
                  <div className="mt-2 flex min-h-13 overflow-hidden rounded-lg border border-input focus-within:ring-2 focus-within:ring-ring">
                    <span className="flex items-center border-r border-border bg-muted px-3 font-semibold">
                      +91
                    </span>
                    <input
                      name="phone"
                      required
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="98765 43210"
                      className="min-w-0 flex-1 bg-transparent px-3 outline-none"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="font-semibold">Anything we should know?</span>
                  <textarea
                    name="notes"
                    rows={3}
                    maxLength={1000}
                    placeholder="Reports, existing conditions, preferred dates…"
                    className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2.5 outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>

                {state.error && (
                  <p role="alert" className="rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
                    {state.error}
                  </p>
                )}

                <button
                  type="submit"
                  className="min-h-13 w-full rounded-lg bg-cta font-semibold text-cta-foreground transition-opacity hover:opacity-90"
                >
                  Request a call back
                </button>

                <p className="text-center text-xs leading-5 text-muted-foreground">
                  A coordinator reads every enquiry before it reaches a surgeon.
                </p>
              </form>
            )}

            <a
              href="tel:+911800123456"
              className="mt-5 flex items-center justify-center gap-2 font-semibold text-primary hover:underline"
            >
              <Phone className="size-4" />
              Or call 1800-123-456
            </a>
          </aside>
        </div>
      </section>

      {/* Treatments offered ------------------------------------------- */}
      <section className="mx-auto max-w-[1320px] px-5 py-12 lg:px-8">
        <h2 className="text-2xl font-extrabold sm:text-3xl">Treatments offered</h2>
        <p className="mt-2 text-muted-foreground">
          Indicative starting costs. Final cost depends on the hospital, room category and your
          insurance cover.
        </p>

        <div className="mt-8 space-y-3">
          {surgeryCategories.map(({ name, procedures }) => {
            const isOpen = open === name
            return (
              <div key={name} className="overflow-hidden rounded-xl border border-border bg-card">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? '' : name)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left text-lg font-bold"
                >
                  {name}
                  <ChevronDown
                    className={`size-5 shrink-0 text-muted-foreground transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="grid gap-4 border-t border-border p-6 sm:grid-cols-2 lg:grid-cols-3">
                    {procedures.map(({ name: procedure, from, stay }) => (
                      <article
                        key={procedure}
                        className="rounded-lg border border-border p-4 transition-colors hover:border-primary"
                      >
                        <h3 className="font-bold">{procedure}</h3>
                        <p className="mt-2 inline-flex items-center text-sm">
                          from
                          <IndianRupee className="mx-1 size-3.5" />
                          <span className="font-bold">{from.toLocaleString('en-IN')}</span>
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">Hospital stay: {stay}</p>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
