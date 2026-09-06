'use client'

import { useState } from 'react'
import { Check, ShieldCheck } from 'lucide-react'
import { PracticeHeading } from '@/components/practice-shell'

const shareables = [
  'Prescriptions',
  'Billing (invoices and payments)',
  'Treatment plans',
  'Vital signs',
  'Lab orders',
  'Clinical notes (including attachments)',
  'Files',
]

const tabs = ['Record sharing', 'ABDM facility', 'Online follow-up'] as const

export default function PracticeIntegrationsPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]>('Record sharing')
  const [shared, setShared] = useState<string[]>(['Prescriptions'])
  const [registered, setRegistered] = useState<'yes' | 'no' | ''>('')

  return (
    <>
      <PracticeHeading title="Integrations" />

      <div className="grid gap-5 p-5 lg:grid-cols-[16rem_1fr]">
        <nav className="h-fit overflow-hidden rounded-xl border border-border bg-background">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              aria-current={tab === item ? 'page' : undefined}
              onClick={() => setTab(item)}
              className={`block w-full border-l-[3px] px-5 py-3.5 text-left font-medium transition-colors ${
                tab === item
                  ? 'border-primary bg-soft text-primary'
                  : 'border-transparent hover:bg-muted'
              }`}
            >
              {item}
            </button>
          ))}
        </nav>

        <section className="rounded-xl border border-border bg-background p-6">
          {tab === 'Record sharing' && (
            <>
              <h2 className="text-xl font-extrabold">Share records with patients</h2>
              <p className="mt-2 max-w-2xl leading-8 text-muted-foreground">
                Choose which record types are shared to the patient&apos;s CareNest account
                automatically once you save them to a chart.
              </p>

              <div className="mt-6 space-y-1">
                {shareables.map((item) => (
                  <label
                    key={item}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={shared.includes(item)}
                      onChange={() =>
                        setShared((current) =>
                          current.includes(item)
                            ? current.filter((value) => value !== item)
                            : [...current, item],
                        )
                      }
                      className="size-4 shrink-0 accent-[var(--primary)]"
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </div>

              <p className="mt-6 flex items-start gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                Patients only ever see their own records. Sharing can be switched off per chart.
              </p>
            </>
          )}

          {tab === 'ABDM facility' && (
            <>
              <h2 className="text-xl font-extrabold">Ayushman Bharat health facility registration</h2>
              <p className="mt-2 max-w-2xl leading-8 text-muted-foreground">
                Register your clinic on the ABDM platform to issue and link ABHA numbers, so records
                follow your patients between providers.
              </p>

              <fieldset className="mt-6">
                <legend className="font-semibold">Is the healthcare facility already registered?</legend>
                <div className="mt-3 space-y-2">
                  {(['yes', 'no'] as const).map((value) => (
                    <label key={value} className="flex cursor-pointer items-center gap-3">
                      <input
                        type="radio"
                        name="registered"
                        checked={registered === value}
                        onChange={() => setRegistered(value)}
                        className="size-4 accent-[var(--primary)]"
                      />
                      <span className="capitalize">{value}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <button
                type="button"
                disabled={!registered}
                className="mt-6 min-h-12 rounded-lg bg-cta px-8 font-semibold text-cta-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Confirm
              </button>

              {registered === 'no' && (
                <p className="mt-4 flex items-start gap-2 rounded-lg bg-soft px-4 py-3 text-sm leading-6 text-primary">
                  <Check className="mt-0.5 size-4 shrink-0" />
                  We will walk you through creating a Health Facility ID. Keep your clinic
                  registration certificate and the owner&apos;s Aadhaar handy.
                </p>
              )}
            </>
          )}

          {tab === 'Online follow-up' && (
            <>
              <h2 className="text-xl font-extrabold">Online follow-up</h2>
              <p className="mt-2 max-w-2xl leading-8 text-muted-foreground">
                Offer your clinic patients a free text follow-up for a set window after their visit.
                Replies appear in the patient&apos;s chart.
              </p>
              <button
                type="button"
                className="mt-6 min-h-12 rounded-lg border border-primary px-6 font-semibold text-primary transition-colors hover:bg-soft"
              >
                Enable follow-up window
              </button>
            </>
          )}
        </section>
      </div>
    </>
  )
}
