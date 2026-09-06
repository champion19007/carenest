'use client'

import { useState } from 'react'
import { PracticeHeading } from '@/components/practice-shell'
import { cities, localitiesByCity, topSpecialities } from '@/lib/data'

const sections = [
  'Practice details',
  'Practice staff',
  'Calendar',
  'Drug catalogue',
  'Pricing catalogue',
  'Data security',
]

export default function PracticeSettingsPage() {
  const [section, setSection] = useState(sections[0])
  const [city, setCity] = useState('Navi Mumbai')
  const [saved, setSaved] = useState(false)

  const localities = localitiesByCity[city] ?? []

  return (
    <>
      <PracticeHeading title="Settings" />

      <div className="grid gap-5 p-5 lg:grid-cols-[16rem_1fr]">
        <nav className="h-fit overflow-hidden rounded-xl border border-border bg-background">
          {sections.map((item) => (
            <button
              key={item}
              type="button"
              aria-current={section === item ? 'page' : undefined}
              onClick={() => setSection(item)}
              className={`block w-full border-l-[3px] px-5 py-3.5 text-left font-medium transition-colors ${
                section === item
                  ? 'border-primary bg-soft text-primary'
                  : 'border-transparent hover:bg-muted'
              }`}
            >
              {item}
            </button>
          ))}
        </nav>

        <section className="rounded-xl border border-border bg-background p-6">
          <h2 className="text-xl font-extrabold">{section}</h2>

          {section === 'Practice details' ? (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                setSaved(true)
              }}
              className="mt-6 grid gap-5 sm:grid-cols-2"
            >
              <Field label="Clinic name" defaultValue="Sunrise Multispeciality Clinic" required />
              <label className="block">
                <span className="font-semibold">
                  Speciality <span className="text-warning">*</span>
                </span>
                <select
                  required
                  className="mt-1.5 min-h-12 w-full rounded-lg border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
                >
                  {topSpecialities.map(({ name }) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>

              <Field label="Contact number" defaultValue="+91 98765 43210" required />
              <Field label="Email" defaultValue="clinic@carenest.in" type="email" />

              <Field label="Address line 1" defaultValue="Plot 24, Sector 12" required />
              <Field label="Address line 2" defaultValue="Near Central Park" />

              <label className="block">
                <span className="font-semibold">City</span>
                <select
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  className="mt-1.5 min-h-12 w-full rounded-lg border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
                >
                  {cities.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="font-semibold">Locality</span>
                <select
                  className="mt-1.5 min-h-12 w-full rounded-lg border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
                  disabled={localities.length === 0}
                >
                  {localities.length > 0 ? (
                    localities.map((item) => <option key={item}>{item}</option>)
                  ) : (
                    <option>Enter locality manually</option>
                  )}
                </select>
              </label>

              <Field label="PIN code" defaultValue="410210" />
              <Field label="GSTIN" placeholder="27AAAAA0000A1Z5" />

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="min-h-12 rounded-lg bg-cta px-8 font-semibold text-cta-foreground transition-opacity hover:opacity-90"
                >
                  Save changes
                </button>
                {saved && (
                  <span role="status" className="ml-4 font-semibold text-success">
                    Saved
                  </span>
                )}
              </div>
            </form>
          ) : (
            <p className="mt-4 leading-8 text-muted-foreground">
              {section} configuration is available on your plan. Contact your CareNest account
              manager to enable it for this clinic.
            </p>
          )}
        </section>
      </div>
    </>
  )
}

function Field({
  label,
  defaultValue,
  placeholder,
  type = 'text',
  required = false,
}: {
  label: string
  defaultValue?: string
  placeholder?: string
  type?: string
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="font-semibold">
        {label} {required && <span className="text-warning">*</span>}
      </span>
      <input
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1.5 min-h-12 w-full rounded-lg border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  )
}
