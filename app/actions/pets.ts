'use server'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { savePet,addPetHealth } from '@/lib/domain/pets'
import { DomainError } from '@/lib/domain/errors'
export type PetState={error?:string;notice?:string}
export async function petDetails(_prev:PetState,form:FormData):Promise<PetState> {
  const user=await requireUser('/account/pets')
  try{await savePet(user.id,{id:String(form.get('id')??'')||undefined,name:form.get('name'),species:form.get('species'),breed:form.get('breed')??'',dob:form.get('dob'),sex:form.get('sex'),microchip:form.get('microchip')??''})}
  catch(error){if(error instanceof DomainError)return {error:error.message};throw error}
  revalidatePath('/account/pets');return {notice:'Pet profile saved.'}
}
export async function petHealthDetails(_prev:PetState,form:FormData):Promise<PetState> {
  const user=await requireUser('/account/pets')
  try{await addPetHealth(user.id,String(form.get('petId')??''),{weight:form.get('weight'),vaccine:form.get('vaccine'),givenOn:form.get('givenOn'),dueOn:form.get('dueOn')})}
  catch(error){if(error instanceof DomainError)return {error:error.message};throw error}
  revalidatePath('/account/pets');return {notice:'Pet health record saved.'}
}
