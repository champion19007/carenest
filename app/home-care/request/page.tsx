import Link from 'next/link'
import {randomUUID} from 'node:crypto'
import {requireUser} from '@/lib/auth'
import {listFamily} from '@/lib/db/family'
import {ownedPets} from '@/lib/domain/pets'
import {HOME_CARE_SERVICES,type HomeCareService} from '@/lib/home-care'
import {HomeCareRequestForm} from '@/components/home-care-request-form'
import {SiteHeader} from '@/components/site-header'
import {SiteFooter} from '@/components/site-footer'
export const dynamic='force-dynamic'
export const metadata={title:'Request home care · CareNest'}
export default async function Request({searchParams}:{searchParams:Promise<{service?:string;for?:string}>}){
 const p=await searchParams,service=HOME_CARE_SERVICES.includes(p.service as HomeCareService)?p.service as HomeCareService:'nursing',audience=p.for==='pet'?'pet':'human'
 const user=await requireUser(`/home-care/request?service=${service}&for=${audience}`)
 const [family,pets]=await Promise.all([listFamily(user.id),ownedPets(user.id)])
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
 return <main className="min-h-screen bg-background"><SiteHeader/><div className="care-container max-w-3xl py-8 sm:py-12"><Link className="care-text-link" href="/home-care">← Home care</Link><h1 className="mt-5 text-3xl">Request home care</h1><p className="mb-7 mt-3 text-muted-foreground">Tell us what support you need. You can track or cancel the request from your account.</p><HomeCareRequestForm requestKey={randomUUID()} initialService={service} initialAudience={audience} family={family.filter(f=>!f.is_self).map(({id,name})=>({id,name}))} pets={pets.map(({id,name})=>({id,name}))} today={today}/></div><SiteFooter/></main>
}
