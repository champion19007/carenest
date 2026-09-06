'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, BadgeCheck, Lightbulb } from 'lucide-react'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  cities,
  colleges,
  councils,
  degrees,
  localitiesByCity,
  topSpecialities,
} from '@/lib/data'

const steps = [
  { title: 'Profile details', tip: 'Patients search by name and speciality — enter them exactly as on your registration.' },
  { title: 'Medical registration', tip: 'We verify your registration number with the state council before your profile goes live.' },
  { title: 'Education', tip: 'Qualifications and years of experience are among the top three things patients look at.' },
  { title: 'Connect a practice', tip: 'Patients often search by locality, so add every establishment where you consult.' },
  { title: 'Establishment details', tip: 'Accurate clinic details help patients reach you and reduce no-shows.' },
  { title: 'Review', tip: 'Once submitted, our team verifies your documents — usually within two working days.' },
]

export default function PracticeOnboardingPage() {
  const [step, setStep] = useState(0)
  const [city, setCity] = useState('Navi Mumbai')
  const [ownership, setOwnership] = useState<'own' | 'visit'>('own')
  const [done, setDone] = useState(false)

  const localities = localitiesByCity[city] ?? []
  const isLast = step === steps.length - 1

  function next() {
    if (isLast) {
      setDone(true)
      return
    }
    setStep(step + 1)
  }

  return (
    <main className="min-h-screen bg-surface">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-4">
            <Logo />
            <span className="hidden text-sm font-semibold text-muted-foreground sm:inline">
              Step {Math.min(step + 1, steps.length)} of {steps.length}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle compact />
            <Link href="/practice/patients" className="font-semibold text-primary hover:underline">
              Save &amp; exit
            </Link>
          </div>
        </div>
        <div className="h-1.5 bg-muted">
          <div
            className="h-full bg-cta transition-all"
            style={{ width: `${((step + (done ? 1 : 0)) / steps.length) * 100}%` }}
            role="progressbar"
            aria-valuenow={step + 1}
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-label="Onboarding progress"
          />
        </div>
      </header>

      <div className="mx-auto max-w-[1100px] px-5 py-10 lg:px-8">
        {done ? (
          <div className="rounded-xl border border-border bg-background p-10 text-center">
            <BadgeCheck className="mx-auto size-14 text-success" />
            <h1 className="mt-5 text-3xl font-extrabold">Profile submitted</h1>
            <p className="mx-auto mt-3 max-w-lg leading-8 text-muted-foreground">
              Our verification team will check your registration and qualification documents. You
              will get an SMS once your profile is live — usually within two working days.
            </p>
            <Link
              href="/practice/patients"
              className="mt-7 inline-flex min-h-12 items-center rounded-lg bg-cta px-8 font-semibold text-cta-foreground"
            >
              Go to my clinic
            </Link>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
            <form
              onSubmit={(event) => {
                event.preventDefault()
                next()
              }}
              className="rounded-xl border border-border bg-background p-6 lg:p-8"
            >
              <h1 className="text-2xl font-extrabold">{steps[step].title}</h1>

              <div className="mt-7 grid gap-5 sm:grid-cols-2">
                {step === 0 && (
                  <>
                    <Field label="Full name" placeholder="Dr. Ananya Deshmukh" required />
                    <Select label="Speciality" required options={topSpecialities.map((s) => s.name)} />
                    <Select label="Gender" options={['Female', 'Male', 'Other']} />
                    <Select
                      label="City"
                      options={cities}
                      value={city}
                      onChange={setCity}
                    />
                  </>
                )}

                {step === 1 && (
                  <>
                    <Field label="Registration number" placeholder="2011/03/1234" required />
                    <Select label="Medical council" required options={councils} />
                    <Field label="Year of registration" placeholder="2011" required />
                    <div className="sm:col-span-2">
                      <p className="text-sm text-muted-foreground">
                        We check this against the National Medical Commission register. Profiles are
                        not published until verification passes.
                      </p>
                    </div>
                  </>
                )}

                {step === 2 && (
                  <>
                    <Select label="Degree" required options={degrees} />
                    <Select label="College / institute" required options={colleges} />
                    <Field label="Year of completion" placeholder="2015" required />
                    <Field label="Years of experience" placeholder="Between 0 and 70" required />
                    <p className="text-sm text-muted-foreground sm:col-span-2">
                      You can add further qualifications later from your profile.
                    </p>
                  </>
                )}

                {step === 3 && (
                  <fieldset className="sm:col-span-2">
                    <legend className="font-semibold">Select one</legend>
                    <div className="mt-3 space-y-2">
                      {(
                        [
                          ['own', 'I own an establishment'],
                          ['visit', 'I visit an establishment'],
                        ] as const
                      ).map(([value, label]) => (
                        <label
                          key={value}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3.5 transition-colors ${
                            ownership === value ? 'border-primary bg-soft' : 'border-border'
                          }`}
                        >
                          <input
                            type="radio"
                            name="ownership"
                            checked={ownership === value}
                            onChange={() => setOwnership(value)}
                            className="size-4 accent-[var(--primary)]"
                          />
                          <span className="font-medium">{label}</span>
                        </label>
                      ))}
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      You can add multiple establishments one by one.
                    </p>
                  </fieldset>
                )}

                {step === 4 && (
                  <>
                    <Field label="Establishment name" placeholder="Sunrise Clinic" required />
                    <Select label="City" options={cities} value={city} onChange={setCity} />
                    <Select
                      label="Locality"
                      options={localities.length > 0 ? localities : ['Enter manually']}
                    />
                    <Field label="PIN code" placeholder="410210" />
                    <Field label="Consultation fee (₹)" placeholder="600" required />
                  </>
                )}

                {step === 5 && (
                  <div className="sm:col-span-2">
                    <p className="leading-8 text-muted-foreground">
                      Please confirm the details you have entered. After submitting, upload your
                      identity proof, registration certificate and establishment proof so our team
                      can verify your profile.
                    </p>
                    <ul className="mt-5 space-y-2">
                      {['Identity proof (Aadhaar or PAN)', 'Medical registration certificate', 'Establishment ownership or visiting proof'].map(
                        (item) => (
                          <li key={item} className="flex items-center gap-2.5">
                            <BadgeCheck className="size-4 shrink-0 text-primary" />
                            {item}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}
              </div>

              <div className="mt-9 flex items-center justify-between border-t border-border pt-6">
                <button
                  type="button"
                  onClick={() => setStep(Math.max(0, step - 1))}
                  disabled={step === 0}
                  className="inline-flex items-center gap-2 font-semibold disabled:opacity-40"
                >
                  <ArrowLeft className="size-4" />
                  Back
                </button>
                <button
                  type="submit"
                  className="min-h-12 rounded-lg bg-cta px-10 font-semibold text-cta-foreground transition-opacity hover:opacity-90"
                >
                  {isLast ? 'Submit for verification' : 'Next'}
                </button>
              </div>
            </form>

            <aside className="h-fit rounded-xl border border-border bg-soft p-5">
              <Lightbulb className="size-5 text-primary" />
              <p className="mt-3 leading-7 text-primary">{steps[step].tip}</p>
            </aside>
          </div>
        )}
      </div>
    </main>
  )
}

function Field({
  label,
  placeholder,
  required = false,
}: {
  label: string
  placeholder?: string
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="font-semibold">
        {label} {required && <span className="text-warning">*</span>}
      </span>
      <input
        required={required}
        placeholder={placeholder}
        className="mt-1.5 min-h-12 w-full rounded-lg border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  )
}

function Select({
  label,
  options,
  required = false,
  value,
  onChange,
}: {
  label: string
  options: string[]
  required?: boolean
  value?: string
  onChange?: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="font-semibold">
        {label} {required && <span className="text-warning">*</span>}
      </span>
      <select
        required={required}
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className="mt-1.5 min-h-12 w-full rounded-lg border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
      >
        {!value && <option value="">Select {label.toLowerCase()}</option>}
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  )
}
