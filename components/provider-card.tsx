import Link from 'next/link'
import {ArrowUpRight,MapPin,Star,Video,House} from 'lucide-react'
import {Avatar} from './avatar'
import type {DoctorRow} from '@/lib/db/sql'

export function ProviderCard({doctor,variant='list'}:{doctor:DoctorRow;variant?:'list'|'compact'}){
 const profile=`/doctor/${doctor.slug}`
 return <article className={variant==='compact'?'provider-compact p-5':'provider-list'}>
  <div className="flex items-start gap-3"><Link href={profile} aria-label={`View ${doctor.name}`}><Avatar name={doctor.name} speciality={doctor.speciality} size={52}/></Link><div className="min-w-0 flex-1"><h3 className="text-base leading-6"><Link href={profile} className="hover:underline">{doctor.name}</Link></h3><p className="mt-1 text-sm text-muted-foreground">{doctor.speciality}</p></div><Link href={profile} aria-label={`Profile for ${doctor.name}`} className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted"><ArrowUpRight className="size-4"/></Link></div>
  <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">{doctor.is_demo&&<span className="care-status">Sample profile</span>}<span className="text-muted-foreground">{doctor.experience} years’ experience</span></div>
  <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground"><MapPin className="mt-1 size-4 shrink-0"/>{doctor.clinic||'Clinic details on profile'}{doctor.locality&&` · ${doctor.locality}`}{doctor.city&&`, ${doctor.city}`}</p>
  <p className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground"><span>Clinic visit</span>{doctor.video&&<span className="inline-flex items-center gap-1"><Video className="size-4"/>Video</span>}{doctor.home_visit&&<span className="inline-flex items-center gap-1"><House className="size-4"/>Home visit</span>}</p>
  {doctor.reviews_count>0?<p className="mt-3 flex items-center gap-1.5 text-sm"><Star className="size-4 text-warning"/><strong>{doctor.rating.toFixed(1)}</strong><span className="text-muted-foreground">· {doctor.reviews_count} reviews</span></p>:<p className="mt-3 text-sm text-muted-foreground">No patient reviews yet</p>}
  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><div><p className="text-lg font-semibold">₹{doctor.fee.toLocaleString('en-IN')}</p><p className="text-sm text-muted-foreground">Consultation fee</p></div>{doctor.catalogue_only?<Link className="care-secondary" href={profile}>View profile</Link>:<Link href={`/book/${doctor.slug}`} className="care-button">{doctor.is_demo?'Book demo':'Book visit'}</Link>}</div>
 </article>
}
