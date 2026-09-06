'use client'

import { useState } from 'react'
import {
  ChevronDown,
  FileText,
  IndianRupee,
  Pill,
  Plus,
  Printer,
  Share2,
  Stethoscope,
  Trash2,
  X,
} from 'lucide-react'
import { saveChartNote, savePrescription } from '@/app/actions/care'
import {
  drugCatalogue,
  frequencyPresets,
  intakeOptions,
  queuePatients,
  type QueuePatient,
} from '@/lib/data'

type Prescription = {
  id: number
  drug: string
  dose: string
  frequency: string
  intake: string
  days: string
}

type Note = { complaints: string; observations: string; diagnosis: string }

const statusTone: Record<QueuePatient['status'], string> = {
  Waiting: 'bg-accent/15 text-warning',
  Engaged: 'bg-soft text-primary',
  Met: 'bg-success/10 text-success',
}

export default function PracticePatientsPage() {
  const [selectedId, setSelectedId] = useState(queuePatients[0].id)
  const [tab, setTab] = useState<'charting' | 'billing'>('charting')
  const [editor, setEditor] = useState<'none' | 'notes' | 'prescription'>('none')

  const [note, setNote] = useState<Note | null>(null)
  const [draftNote, setDraftNote] = useState<Note>({
    complaints: '',
    observations: '',
    diagnosis: '',
  })

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [drugQuery, setDrugQuery] = useState('')

  const patient = queuePatients.find((item) => item.id === selectedId) ?? queuePatients[0]

  const matches = drugQuery
    ? drugCatalogue.filter((drug) =>
        drug.name.toLowerCase().startsWith(drugQuery.trim().toLowerCase()),
      )
    : []

  function addDrug(name: string, strength: string, form: string) {
    setPrescriptions((current) => [
      ...current,
      {
        id: Date.now(),
        drug: `${form} ${name} (${strength})`,
        dose: '1',
        frequency: 'Twice a day',
        intake: 'After food',
        days: '5',
      },
    ])
    setDrugQuery('')
  }

  function updateDrug(id: number, patch: Partial<Prescription>) {
    setPrescriptions((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }

  return (
    <div className="grid min-h-[calc(100vh-4.5rem)] lg:grid-cols-[19rem_1fr_20rem]">
      {/* Patient queue -------------------------------------------------- */}
      <aside className="border-r border-border bg-background">
        <div className="border-b border-border px-5 py-4">
          <h1 className="text-xl font-extrabold">Patients</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Sunrise Clinic · Kharghar</p>
        </div>

        <div className="flex border-b border-border">
          {['Today', 'Recent', 'All'].map((label, index) => (
            <button
              key={label}
              type="button"
              className={`flex-1 border-b-2 px-4 py-3 text-sm font-semibold ${
                index === 0
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <ul>
          {queuePatients.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setSelectedId(item.id)}
                aria-current={item.id === selectedId ? 'true' : undefined}
                className={`w-full border-l-[3px] border-b border-b-border px-5 py-4 text-left transition-colors ${
                  item.id === selectedId
                    ? 'border-l-primary bg-soft'
                    : 'border-l-transparent hover:bg-muted'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">{item.name}</span>
                  <span className="shrink-0 text-sm text-muted-foreground">{item.time}</span>
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">{item.reason}</p>
                <span
                  className={`mt-2 inline-block rounded px-2 py-0.5 text-xs font-bold ${statusTone[item.status]}`}
                >
                  {item.status}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Chart ---------------------------------------------------------- */}
      <section className="min-w-0 bg-surface">
        <div className="border-b border-border bg-background px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-soft text-lg font-bold text-primary">
                {patient.name
                  .split(' ')
                  .map((part) => part[0])
                  .join('')}
              </span>
              <div>
                <h2 className="text-2xl font-extrabold">{patient.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {patient.gender} · {patient.age} yrs · {patient.bloodGroup} · {patient.phone}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="inline-flex min-h-10 items-center rounded-lg border border-primary px-4 text-sm font-semibold text-primary transition-colors hover:bg-soft"
            >
              Link ABHA ID
            </button>
          </div>

          <div className="mt-5 inline-flex rounded-lg bg-muted p-1">
            {(['charting', 'billing'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={`min-h-10 rounded-md px-6 text-sm font-semibold capitalize transition-colors ${
                  tab === value ? 'bg-background shadow-sm' : 'text-muted-foreground'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        {tab === 'billing' ? (
          <BillingPanel />
        ) : (
          <div className="p-5">
            <div className="rounded-xl border border-border bg-background">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <p className="font-bold">Appointment with Dr. Ananya Deshmukh</p>
                  <p className="text-sm text-muted-foreground">Today · {patient.time} · 10 minutes</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Print chart"
                    className="rounded-lg border border-border p-2.5 hover:bg-muted"
                  >
                    <Printer className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Share chart"
                    className="rounded-lg border border-border p-2.5 hover:bg-muted"
                  >
                    <Share2 className="size-4" />
                  </button>
                  <AddRecordsMenu onPick={setEditor} />
                </div>
              </div>

              <div className="divide-y divide-border">
                {/* Clinical notes */}
                {editor === 'notes' ? (
                  <form
                    action={async (formData: FormData) => {
                      await saveChartNote(formData)
                      setNote(draftNote)
                      setEditor('none')
                    }}
                    className="p-5"
                  >
                    <input type="hidden" name="patientId" value={patient.id} />
                    <div className="flex items-center justify-between">
                      <h3 className="inline-flex items-center gap-2 font-bold">
                        <FileText className="size-4 text-primary" />
                        Clinical notes
                      </h3>
                      <button
                        type="button"
                        onClick={() => setEditor('none')}
                        aria-label="Close notes editor"
                        className="rounded-lg p-1.5 hover:bg-muted"
                      >
                        <X className="size-4" />
                      </button>
                    </div>

                    <div className="mt-4 space-y-4">
                      {(
                        [
                          ['complaints', 'Complaints'],
                          ['observations', 'Observations'],
                          ['diagnosis', 'Diagnosis'],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key} className="block">
                          <span className="text-sm font-semibold">{label}</span>
                          <textarea
                            rows={2}
                            name={key}
                            value={draftNote[key]}
                            onChange={(event) =>
                              setDraftNote({ ...draftNote, [key]: event.target.value })
                            }
                            placeholder={`Add ${label.toLowerCase()}…`}
                            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
                          />
                        </label>
                      ))}
                    </div>

                    <div className="mt-5 flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setEditor('none')}
                        className="min-h-11 rounded-lg border border-border px-5 font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="min-h-11 rounded-lg bg-cta px-6 font-semibold text-cta-foreground"
                      >
                        Save
                      </button>
                    </div>
                  </form>
                ) : note ? (
                  <div className="p-5">
                    <h3 className="inline-flex items-center gap-2 font-bold">
                      <FileText className="size-4 text-primary" />
                      Clinical notes
                    </h3>
                    <dl className="mt-3 space-y-2 text-[0.95rem]">
                      {note.complaints && <Row label="Complaints" value={note.complaints} />}
                      {note.observations && <Row label="Observations" value={note.observations} />}
                      {note.diagnosis && <Row label="Diagnosis" value={note.diagnosis} />}
                    </dl>
                  </div>
                ) : null}

                {/* Prescriptions */}
                {(editor === 'prescription' || prescriptions.length > 0) && (
                  <div className="p-5">
                    <div className="flex items-center justify-between">
                      <h3 className="inline-flex items-center gap-2 font-bold">
                        <Pill className="size-4 text-primary" />
                        Prescription
                      </h3>
                      {editor === 'prescription' && (
                        <button
                          type="button"
                          onClick={() => setEditor('none')}
                          aria-label="Close prescription editor"
                          className="rounded-lg p-1.5 hover:bg-muted"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </div>

                    {prescriptions.length > 0 && (
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-[42rem] text-left text-sm">
                          <thead className="border-b border-border text-xs font-bold uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="pb-2">Drug</th>
                              <th className="pb-2">Dose &amp; frequency</th>
                              <th className="pb-2">Intake</th>
                              <th className="pb-2">Duration</th>
                              <th className="pb-2" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {prescriptions.map((item) => (
                              <tr key={item.id}>
                                <td className="py-3 pr-3 font-semibold">{item.drug}</td>
                                <td className="py-3 pr-3">
                                  {editor === 'prescription' ? (
                                    <div className="flex items-center gap-2">
                                      <input
                                        value={item.dose}
                                        onChange={(event) =>
                                          updateDrug(item.id, { dose: event.target.value })
                                        }
                                        aria-label="Dose"
                                        className="w-14 rounded-lg border border-input bg-background px-2 py-1.5 outline-none focus:ring-2 focus:ring-ring"
                                      />
                                      <select
                                        value={item.frequency}
                                        onChange={(event) =>
                                          updateDrug(item.id, { frequency: event.target.value })
                                        }
                                        aria-label="Frequency"
                                        className="rounded-lg border border-input bg-background px-2 py-1.5 outline-none focus:ring-2 focus:ring-ring"
                                      >
                                        {frequencyPresets.map((preset) => (
                                          <option key={preset}>{preset}</option>
                                        ))}
                                      </select>
                                    </div>
                                  ) : (
                                    `${item.dose} · ${item.frequency}`
                                  )}
                                </td>
                                <td className="py-3 pr-3">
                                  {editor === 'prescription' ? (
                                    <select
                                      value={item.intake}
                                      onChange={(event) =>
                                        updateDrug(item.id, { intake: event.target.value })
                                      }
                                      aria-label="Intake"
                                      className="rounded-lg border border-input bg-background px-2 py-1.5 outline-none focus:ring-2 focus:ring-ring"
                                    >
                                      {intakeOptions.map((option) => (
                                        <option key={option}>{option}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    item.intake
                                  )}
                                </td>
                                <td className="py-3 pr-3">
                                  {editor === 'prescription' ? (
                                    <span className="inline-flex items-center gap-1.5">
                                      <input
                                        value={item.days}
                                        onChange={(event) =>
                                          updateDrug(item.id, { days: event.target.value })
                                        }
                                        aria-label="Duration in days"
                                        className="w-16 rounded-lg border border-input bg-background px-2 py-1.5 outline-none focus:ring-2 focus:ring-ring"
                                      />
                                      days
                                    </span>
                                  ) : (
                                    `${item.days} days`
                                  )}
                                </td>
                                <td className="py-3 text-right">
                                  {editor === 'prescription' && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPrescriptions((current) =>
                                          current.filter((drug) => drug.id !== item.id),
                                        )
                                      }
                                      aria-label={`Remove ${item.drug}`}
                                      className="rounded-lg p-1.5 text-warning hover:bg-warning/10"
                                    >
                                      <Trash2 className="size-4" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {editor === 'prescription' && prescriptions.length > 0 && (
                      <form
                        action={async (formData: FormData) => {
                          await savePrescription(formData)
                          setEditor('none')
                        }}
                        className="mt-5 flex justify-end gap-3 border-t border-border pt-5"
                      >
                        <input type="hidden" name="patientId" value={patient.id} />
                        <input type="hidden" name="patientName" value={patient.name} />
                        <input
                          type="hidden"
                          name="drugs"
                          value={JSON.stringify(prescriptions.map(({ id: _id, ...rest }) => rest))}
                        />
                        <button
                          type="submit"
                          className="min-h-11 rounded-lg bg-cta px-6 font-semibold text-cta-foreground"
                        >
                          Save prescription
                        </button>
                      </form>
                    )}

                    {editor === 'prescription' && (
                      <div className="relative mt-4 max-w-sm">
                        <input
                          value={drugQuery}
                          onChange={(event) => setDrugQuery(event.target.value)}
                          placeholder="Search drugs…"
                          aria-label="Search the drug catalogue"
                          className="min-h-11 w-full rounded-lg border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
                        />
                        {matches.length > 0 && (
                          <ul className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
                            {matches.map((drug) => (
                              <li key={drug.name}>
                                <button
                                  type="button"
                                  onClick={() => addDrug(drug.name, drug.strength, drug.form)}
                                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted"
                                >
                                  <span className="font-medium">{drug.name}</span>
                                  <span className="text-muted-foreground">
                                    {drug.form} · {drug.strength}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {editor === 'none' && !note && prescriptions.length === 0 && (
                  <p className="px-5 py-12 text-center text-muted-foreground">
                    No records added yet. Use <strong>Add records</strong> to start this chart.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Medical history ------------------------------------------------ */}
      <aside className="border-l border-border bg-background p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Medical history
        </h2>
        <div className="mt-4">
          <p className="font-bold">Personal history</p>
          {patient.history.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {patient.history.map((item) => (
                <li key={item} className="flex items-center gap-2 text-[0.95rem]">
                  <span className="size-1.5 rounded-full bg-cta" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No history recorded</p>
          )}
          <button type="button" className="mt-3 text-sm font-semibold text-primary hover:underline">
            + Add condition
          </button>
        </div>

        <hr className="my-6 border-border" />

        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Treatment communications
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          No active reminders for this patient yet.
        </p>
        <button
          type="button"
          className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-primary px-4 text-sm font-semibold text-primary hover:bg-soft"
        >
          Schedule reminder
        </button>
      </aside>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-6">
      <dt className="w-32 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 font-medium">{value}</dd>
    </div>
  )
}

function AddRecordsMenu({ onPick }: { onPick: (value: 'notes' | 'prescription') => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-cta px-4 text-sm font-semibold text-cta-foreground"
      >
        <Plus className="size-4" />
        Add records
        <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
            {(
              [
                ['notes', 'Clinical notes', Stethoscope],
                ['prescription', 'Prescription', Pill],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  onPick(value)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-muted"
              >
                <Icon className="size-4 text-primary" />
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function BillingPanel() {
  const lines = [
    { label: 'Consultation fee', amount: 600 },
    { label: 'Dressing', amount: 250 },
  ]
  const total = lines.reduce((sum, line) => sum + line.amount, 0)

  return (
    <div className="p-5">
      <div className="rounded-xl border border-border bg-background p-5">
        <h3 className="font-bold">Invoice</h3>
        <table className="mt-4 w-full text-left text-sm">
          <tbody className="divide-y divide-border">
            {lines.map(({ label, amount }) => (
              <tr key={label}>
                <td className="py-3">{label}</td>
                <td className="py-3 text-right font-semibold">
                  <span className="inline-flex items-center">
                    <IndianRupee className="size-3.5" />
                    {amount}
                  </span>
                </td>
              </tr>
            ))}
            <tr>
              <td className="py-3 font-bold">Total</td>
              <td className="py-3 text-right text-lg font-extrabold">
                <span className="inline-flex items-center">
                  <IndianRupee className="size-4" />
                  {total}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            className="min-h-11 rounded-lg bg-cta px-6 font-semibold text-cta-foreground"
          >
            Collect payment
          </button>
          <button type="button" className="min-h-11 rounded-lg border border-border px-5 font-semibold">
            Send UPI link
          </button>
        </div>
      </div>
    </div>
  )
}
