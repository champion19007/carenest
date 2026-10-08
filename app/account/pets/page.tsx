import Link from 'next/link'
import {requireUser} from '@/lib/auth'
import {ownedPets,petHealth} from '@/lib/domain/pets'
import {PatientWorkspace} from '@/components/patient-workspace'
import {PetForm,PetHealthForm} from '@/components/pet-forms'
export const dynamic='force-dynamic'
export default async function PetsAccount() {
 const user=await requireUser('/account/pets'),pets=await ownedPets(user.id)
 const health=await Promise.all(pets.map(pet=>petHealth(user.id,pet.id)))
 return <PatientWorkspace title="Your pets" description="Keep identities, dated weights and vaccination history separate from human records."><div className="grid gap-5 lg:grid-cols-2"><PetForm/><div className="space-y-5">{pets.map((pet,i)=><section key={pet.id} className="rounded-2xl border border-border bg-card p-5"><h2 className="text-xl">{pet.name}</h2><p className="text-sm text-muted-foreground">{pet.species} · {pet.breed||'Breed not recorded'} · {pet.sex}</p><Link href={`/pets?species=${pet.species}`} className="care-button mt-4">Find veterinary care</Link><h3 className="mt-5 text-base">Health history</h3>{health[i].weights.length>0&&<p className="text-sm">Last recorded weight: {health[i].weights[0].weight_kg} kg</p>}<ul className="mt-3 space-y-2 text-sm">{health[i].vaccines.map(v=><li key={v.id}>{v.name} · given {String(v.given_on).slice(0,10)}{v.due_on?` · next due ${String(v.due_on).slice(0,10)}`:''}</li>)}</ul><PetHealthForm petId={pet.id}/></section>)}{!pets.length&&<p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">Add your pet to book a veterinarian appointment.</p>}</div></div></PatientWorkspace>
}
