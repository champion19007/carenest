'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { addFamily, deleteFamily, editFamily, type ProfileState } from '@/app/actions/profile'
import { Avatar } from '@/components/avatar'

const empty: ProfileState = {}

export type Member = {
  id: string
  name: string
  relation: string
  dob: string | null
  gender: string | null
  blood_group: string | null
  phone: string | null
  is_self: boolean
}

const RELATIONS = [
  'Spouse',
  'Son',
  'Daughter',
  'Father',
  'Mother',
  'Brother',
  'Sister',
  'Grandfather',
  'Grandmother',
  'Other',
]

/** Whole years, which is how a clinic asks for it. */
function ageFrom(dob: string | null) {
  if (!dob) return null
  const born = new Date(dob)
  if (Number.isNaN(born.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  const monthDiff = now.getMonth() - born.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getDate())) age--
  return age >= 0 && age < 130 ? age : null
}

export function FamilyManager({ members }: { members: Member[] }) {
  /* One panel open at a time: `null` closed, `'new'` adding, otherwise the id
     being edited. A single value cannot get into the state where two forms
     are open and it is unclear which one Save belongs to. */
  const [panel, setPanel] = useState<string | null>(null)

  return (
    <div>
      <ul className="divide-y divide-border">
        {members.map((member) => (
          <li key={member.id} className="py-4 first:pt-0">
            {panel === member.id ? (
              <MemberForm
                member={member}
                onClose={() => setPanel(null)}
                action="edit"
              />
            ) : (
              <div className="flex items-center gap-4">
                <Avatar name={member.name} speciality={member.relation} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{member.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {member.relation}
                    {ageFrom(member.dob) !== null && ` · ${ageFrom(member.dob)} yrs`}
                    {member.blood_group && ` · ${member.blood_group}`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setPanel(member.id)}
                  aria-label={`Edit ${member.name}`}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="size-4" />
                </button>

                {/* The account holder has no remove control at all, rather
                    than one that fails when pressed. */}
                {!member.is_self && <RemoveButton id={member.id} name={member.name} />}
              </div>
            )}
          </li>
        ))}
      </ul>

      {panel === 'new' ? (
        <div className="mt-5 rounded-xl border border-border bg-muted/40 p-5">
          <MemberForm onClose={() => setPanel(null)} action="add" />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPanel('new')}
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-input font-semibold text-primary hover:bg-muted"
        >
          <Plus className="size-4" />
          Add family member
        </button>
      )}
    </div>
  )
}

function MemberForm({
  member,
  onClose,
  action,
}: {
  member?: Member
  onClose: () => void
  action: 'add' | 'edit'
}) {
  const [state, submit] = useActionState(action === 'add' ? addFamily : editFamily, empty)

  return (
    <form
      action={(formData) => {
        submit(formData)
        /* Optimistic close. The server action revalidates the page, so if the
           write failed the row simply reappears unchanged. */
        if (!state.error) onClose()
      }}
      className="space-y-4"
    >
      {member && <input type="hidden" name="id" value={member.id} />}

      <div className="flex items-center justify-between">
        <h3 className="font-semibold">
          {action === 'add' ? 'Add a family member' : `Edit ${member?.name}`}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel"
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold">Full name</span>
          <input
            name="name"
            defaultValue={member?.name ?? ''}
            required
            maxLength={80}
            autoFocus
            className="field mt-1.5"
          />
        </label>

        {!member?.is_self && (
          <label className="block">
            <span className="text-sm font-semibold">Relation</span>
            <select
              name="relation"
              defaultValue={member?.relation ?? ''}
              required
              className="field mt-1.5"
            >
              <option value="">Choose…</option>
              {RELATIONS.map((relation) => (
                <option key={relation}>{relation}</option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="text-sm font-semibold">Date of birth</span>
          <input
            name="dob"
            type="date"
            defaultValue={member?.dob?.slice(0, 10) ?? ''}
            max={new Date().toISOString().slice(0, 10)}
            className="field mt-1.5"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold">Gender</span>
          <select name="gender" defaultValue={member?.gender ?? ''} className="field mt-1.5">
            <option value="">Prefer not to say</option>
            <option>Female</option>
            <option>Male</option>
            <option>Other</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-semibold">Blood group</span>
          <select name="bloodGroup" defaultValue={member?.blood_group ?? ''} className="field mt-1.5">
            <option value="">Not known</option>
            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((group) => (
              <option key={group}>{group}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-semibold">Mobile (optional)</span>
          <input
            name="phone"
            type="tel"
            inputMode="numeric"
            maxLength={10}
            defaultValue={member?.phone ?? ''}
            className="field mt-1.5"
          />
        </label>
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-warning/10 px-4 py-2.5 text-sm font-medium text-warning">
          {state.error}
        </p>
      )}

      <SaveMember label={action === 'add' ? 'Add member' : 'Save changes'} />
    </form>
  )
}

function SaveMember({ label }: { label: string }) {
  const status = useFormStatus()
  return (
    <button
      type="submit"
      disabled={status.pending}
      className="min-h-11 rounded-lg bg-cta px-6 font-semibold text-cta-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {status.pending ? 'Saving…' : label}
    </button>
  )
}

function RemoveButton({ id, name }: { id: string; name: string }) {
  const [, submit] = useActionState(deleteFamily, empty)
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <form action={submit} className="flex items-center gap-2">
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          className="rounded-lg bg-warning/15 px-3 py-1.5 text-sm font-semibold text-warning"
        >
          Remove
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-sm font-semibold text-muted-foreground hover:underline"
        >
          Cancel
        </button>
      </form>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      aria-label={`Remove ${name}`}
      className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-warning"
    >
      <Trash2 className="size-4" />
    </button>
  )
}
