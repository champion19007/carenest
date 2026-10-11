'use client'
import {PET_SPECIES} from '@/lib/species'

import {useActionState} from 'react'
import {petDetails,petHealthDetails,type PetState} from '@/app/actions/pets'
export function PetForm() {
 const [state,action,pending]=useActionState(petDetails,{} as PetState)
 return <form action={action} className="rounded-2xl border border-border bg-card p-5"><h2 className="text-lg">Add a pet</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label>Name<input name="name" required maxLength={80} className="field"/></label><label>Species<select name="species" className="field">{PET_SPECIES.map(s=><option key={s}>{s}</option>)}</select></label><label>Breed<input name="breed" maxLength={80} className="field"/></label><label>Date of birth, if known<input name="dob" type="date" className="field"/></label><label>Sex<select name="sex" className="field">{['unknown','male','female'].map(s=><option key={s}>{s}</option>)}</select></label><label>Microchip, if known<input name="microchip" maxLength={40} className="field"/></label></div><p role="status" className="mt-3 text-sm">{state.error??state.notice}</p><button disabled={pending} className="care-button mt-4">{pending?'Saving…':'Save pet'}</button></form>
}
export function PetHealthForm({petId}:{petId:string}) {
 const [state,action,pending]=useActionState(petHealthDetails,{} as PetState)
 return <form action={action} className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2"><input name="petId" type="hidden" value={petId}/><label>Weight (kg)<input name="weight" type="number" min="0.001" max="9999" step="0.001" className="field"/></label><label>Vaccination name<input name="vaccine" maxLength={120} className="field"/></label><label>Given on<input name="givenOn" type="date" className="field"/></label><label>Next due, if known<input name="dueOn" type="date" className="field"/></label><p role="status" className="text-sm">{state.error??state.notice}</p><button disabled={pending} className="care-button">{pending?'Saving…':'Save health record'}</button></form>
}
