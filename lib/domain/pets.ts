import 'server-only'
import { randomUUID } from 'node:crypto'
import { getDb,ensureSchema,type Db } from '@/lib/db/client'
import { boundedText,reject } from './errors'
export type Pet={id:string;name:string;species:string;breed:string;dob:string|null;sex:string;microchip:string|null}
const species=['dog','cat','rabbit','bird','other'], sexes=['male','female','unknown']
function calendarDate(value:unknown,optional=false) {
  const text=String(value??'')
  if(!text&&optional)return null
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||Number.isNaN(new Date(text).getTime())||new Date(text).toISOString().slice(0,10)!==text)reject('VALIDATION','Enter a valid calendar date.',400)
  return text
}
async function owner(tx:Db,actorId:string,petId?:string) {
  if(!await tx.one("SELECT id FROM patient.users WHERE id=$1 AND status='ACTIVE'",[actorId]))reject('FORBIDDEN','Please sign in again.',403)
  if(petId&&!await tx.one('SELECT id FROM patient.pets WHERE id=$1 AND owner_id=$2 AND archived_at IS NULL FOR SHARE',[petId,actorId]))reject('FORBIDDEN','That pet is unavailable.',403)
}
export async function ownedPets(actorId:string):Promise<Pet[]> {
  await ensureSchema()
  return getDb().transaction(async tx=>{await owner(tx,actorId);return tx.query<Pet>('SELECT id,name,species,breed,dob,sex,microchip FROM patient.pets WHERE owner_id=$1 AND archived_at IS NULL ORDER BY created_at,id',[actorId])})
}
export async function savePet(actorId:string,input:{id?:string;name:unknown;species:unknown;breed:unknown;dob?:unknown;sex:unknown;microchip?:unknown}) {
  const name=boundedText(input.name,80,1),kind=boundedText(input.species,20,1),sex=boundedText(input.sex,20,1),breed=boundedText(input.breed,80),dob=calendarDate(input.dob,true),microchip=boundedText(input.microchip??'',40)
  if(!species.includes(kind)||!sexes.includes(sex))reject('VALIDATION','Choose a species and sex from the list.',400)
  await ensureSchema()
  return getDb().transaction(async tx=>{
    await owner(tx,actorId,input.id)
    if(dob) {const valid=await tx.one<{valid:boolean}>("SELECT $1::date <= (now() AT TIME ZONE 'Asia/Kolkata')::date AND $1::date > date '1900-01-01' AS valid",[dob]);if(!valid?.valid)reject('VALIDATION','Check the birth date.',400)}
    const id=input.id??'pet_'+randomUUID()
    if(input.id) await tx.query('UPDATE patient.pets SET name=$3,species=$4,breed=$5,dob=$6,sex=$7,microchip=$8 WHERE id=$1 AND owner_id=$2',[id,actorId,name,kind,breed,dob,sex,microchip||null])
    else await tx.query('INSERT INTO patient.pets(id,owner_id,name,species,breed,dob,sex,microchip) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,actorId,name,kind,breed,dob,sex,microchip||null])
    await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'pet:save',$2)",[actorId,id])
    return id
  })
}
export async function petHealth(actorId:string,petId:string) {
  await ensureSchema()
  return getDb().transaction(async tx=>{
    await owner(tx,actorId,petId)
    const vaccines=await tx.query<{id:string;name:string;given_on:string;due_on:string|null}>('SELECT id,name,given_on,due_on FROM patient.pet_vaccinations WHERE pet_id=$1 ORDER BY given_on DESC',[petId])
    const weights=await tx.query<{weight_kg:string;measured_at:string}>('SELECT weight_kg,measured_at FROM patient.pet_measurements WHERE pet_id=$1 ORDER BY measured_at DESC LIMIT 10',[petId])
    await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'pet:read-health',$2)",[actorId,petId])
    return {vaccines,weights}
  })
}
export async function addPetHealth(actorId:string,petId:string,input:{weight?:unknown;vaccine?:unknown;givenOn?:unknown;dueOn?:unknown}) {
  const weight=input.weight?Number(input.weight):null,vaccine=String(input.vaccine??'').trim()
  if(weight!==null&&(!Number.isFinite(weight)||weight<=0||weight>9999))reject('VALIDATION','Enter a positive weight in kilograms.',400)
  const givenOn=vaccine?calendarDate(input.givenOn):null,dueOn=vaccine?calendarDate(input.dueOn,true):null
  if(vaccine)boundedText(vaccine,120,2)
  if(dueOn&&givenOn&&dueOn<givenOn)reject('VALIDATION','The next due date must follow the given date.',400)
  if(!vaccine&&weight===null)reject('VALIDATION','Enter a weight or vaccination record.',400)
  await ensureSchema()
  await getDb().transaction(async tx=>{
    await owner(tx,actorId,petId)
    if(weight!==null)await tx.query('INSERT INTO patient.pet_measurements(id,pet_id,weight_kg,recorded_by) VALUES($1,$2,$3,$4)',['weight_'+randomUUID(),petId,String(weight),actorId])
    if(vaccine)await tx.query('INSERT INTO patient.pet_vaccinations(id,pet_id,name,given_on,due_on,recorded_by) VALUES($1,$2,$3,$4,$5,$6)',['vax_'+randomUUID(),petId,vaccine,givenOn,dueOn,actorId])
    await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'pet:health-update',$2)",[actorId,petId])
  })
}
