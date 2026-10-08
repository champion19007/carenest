import Link from 'next/link'
import { ArrowUpRight, MapPin, Star, Stethoscope, Video } from 'lucide-react'
import { Avatar } from './avatar'
import type { DoctorRow } from '@/lib/db/sql'

/** Profiles have no supplied portrait yet; retain generated avatars. */
export function ProviderCard({ doctor, variant = 'list' }: { doctor: DoctorRow; variant?: 'list' | 'compact' }) {
  const rating = doctor.reviews_count > 0 ? <span className="inline-flex items-center gap-1.5 text-xs"><Star className="size-3.5 fill-[#f4ad39] text-[#f4ad39]" /><strong>{doctor.rating.toFixed(1)}</strong><span className="text-muted-foreground">({doctor.reviews_count} reviews)</span></span> : <span className="text-xs text-muted-foreground">No reviews yet</span>
  if (variant === 'compact') return <article className="provider-compact">
    <Link href={`/doctor/${doctor.slug}`} className="provider-portrait" aria-label={`View ${doctor.name}`}><Avatar name={doctor.name} speciality={doctor.speciality} size={84} /><span className="absolute right-3 top-3 rounded-full bg-card/80 p-1.5 text-primary"><ArrowUpRight className="size-4" /></span></Link>
    <div className="px-3.5 pb-4 pt-3"><h3 className="truncate text-sm"><Link href={`/doctor/${doctor.slug}`} className="hover:text-primary">{doctor.name}</Link></h3>{doctor.is_demo&&<p className="mt-1 text-[10px] font-semibold text-warning">Sample profile</p>}<p className="mt-1 truncate text-xs text-muted-foreground">{doctor.speciality}</p><div className="mt-2">{rating}</div><p className="mt-2 text-xs font-semibold text-primary">₹{doctor.fee.toLocaleString('en-IN')} <span className="font-normal text-muted-foreground">/ visit</span></p></div>
  </article>
  return <article className="provider-list">
    <div className="flex items-start gap-3.5"><Link href={`/doctor/${doctor.slug}`} aria-label={`View ${doctor.name}`}><Avatar name={doctor.name} speciality={doctor.speciality} size={64} /></Link><div className="min-w-0 flex-1"><h3 className="text-base"><Link href={`/doctor/${doctor.slug}`} className="hover:text-primary">{doctor.name}</Link></h3>{doctor.is_demo&&<p className="mt-1 text-[10px] font-semibold text-warning">Sample profile</p>}<p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Stethoscope className="size-3.5" />{doctor.speciality}</p><div className="mt-2">{rating}</div></div><Link href={`/doctor/${doctor.slug}`} aria-label={`Profile for ${doctor.name}`} className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-primary"><ArrowUpRight className="size-4" /></Link></div>
    <p className="mt-4 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground"><MapPin className="mt-0.5 size-3.5 shrink-0" />{doctor.clinic} · {doctor.locality}, {doctor.city}</p>
    <dl className="mt-4 grid grid-cols-3 divide-x divide-border rounded-xl bg-surface py-3 text-center"><div className="px-2"><dt className="text-[10px] text-muted-foreground">Consultation</dt><dd className="mt-1 flex items-center justify-center gap-1 text-xs font-semibold text-primary">{doctor.video && <Video className="size-3" />}{doctor.video ? 'Clinic / video' : 'Clinic visit'}</dd></div><div className="px-2"><dt className="text-[10px] text-muted-foreground">Experience</dt><dd className="mt-1 text-xs font-semibold">{doctor.experience} years</dd></div><div className="px-2"><dt className="text-[10px] text-muted-foreground">Consultation fee</dt><dd className="mt-1 text-xs font-semibold">₹{doctor.fee.toLocaleString('en-IN')}</dd></div></dl>
    <Link href={`/book/${doctor.slug}`} className="care-button mt-4 w-full"><Stethoscope className="size-4" />Book appointment</Link>
  </article>
}
