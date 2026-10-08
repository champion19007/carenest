import Link from 'next/link'
import { ArrowRight, CalendarDays, Clock3, Heart, PawPrint, ShieldCheck, Stethoscope, Video } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { DiscoverySearch, SpecialtyChips } from '@/components/discovery-search'
import { ProviderCard } from '@/components/provider-card'
import { Photo } from '@/components/photo'
import { photos } from '@/lib/images'
import { searchDoctors } from '@/lib/db/sql'
import { currentUser } from '@/lib/auth'
import { nextHomeAppointment } from '@/lib/db/home'
import { slotDay, slotTime } from '@/lib/slot-format'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [doctors, user] = await Promise.all([
    searchDoctors({ kind: 'human', sort: 'rating', limit: 6 }),
    currentUser(),
  ])
  const next = user ? await nextHomeAppointment(user.id) : undefined
  const firstName = user?.name?.trim().split(/\s+/)[0]

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />
      <section className="discovery-hero">
        <div className="care-container grid items-center gap-10 py-4 sm:py-7 lg:grid-cols-[1.2fr_0.8fr] lg:py-14">
          <div>
            <div className="mb-4 flex items-center gap-3 sm:mb-5">
              <span className="flex size-11 items-center justify-center rounded-2xl border border-primary/15 bg-card text-primary"><Heart className="size-5" /></span>
              <div><p className="text-xs text-muted-foreground">A little care goes a long way</p><p className="text-sm font-semibold">{firstName ? `Welcome back, ${firstName}` : 'Welcome to CareNest'}</p></div>
            </div>
            <p className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-primary lg:block">Your family. Your pets. Your care.</p>
            <h1 className="sr-only max-w-xl leading-[1.2] sm:not-sr-only sm:text-5xl lg:mt-4 lg:text-[3.8rem]">Feeling better starts<br className="hidden sm:block" /> with the <span className="text-primary">right care.</span></h1>
            <p className="mt-4 hidden max-w-lg text-sm leading-7 text-muted-foreground sm:block sm:text-base">Find a doctor, compare consultation fees, and choose a time that works for you.</p>
            <div className="sm:mt-6"><DiscoverySearch /></div>
            <div className="mt-5 hidden flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground sm:flex"><span className="flex items-center gap-1.5"><ShieldCheck className="size-4 text-primary" /> Fees shown upfront</span><span className="flex items-center gap-1.5"><CalendarDays className="size-4 text-primary" /> Choose your appointment</span></div>
          </div>
          <div className="relative hidden pl-8 lg:block">
            <Photo photo={photos.heroConsult} ratio={1.15} width={640} priority className="rounded-[2rem]" scrim="none" />
            <div className="absolute -bottom-5 left-0 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-lg shadow-primary/5"><span className="flex size-11 items-center justify-center rounded-xl bg-soft text-primary"><Stethoscope className="size-5" /></span><div><p className="text-sm font-semibold">Care that fits your life</p><p className="text-xs text-muted-foreground">At the clinic or over a video call</p></div></div>
          </div>
        </div>
      </section>

      <div className="care-container space-y-6 pb-12 pt-4 sm:space-y-8 sm:pt-6 lg:space-y-12 lg:pt-10">
        <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]" aria-label="Your next steps">
          <div className="appointment-banner">
            <div className="flex items-center justify-between gap-3"><p className="text-xs font-medium text-white/85">{next ? (next.status === 'requested' ? 'Appointment request' : 'Upcoming appointment') : 'Your next appointment'}</p><CalendarDays className="size-5 text-white/80" /></div>
            <h2 className="mt-2 text-lg sm:mt-3 sm:text-2xl">{next ? next.doctor_name : 'Make room for your wellbeing.'}</h2>
            <p className={`mt-2 max-w-md text-xs leading-6 text-white/85 sm:text-sm ${next ? '' : 'hidden sm:block'}`}>{next ? `${next.speciality} · ${next.status === 'requested' ? 'Awaiting clinic confirmation' : 'Confirmed'}` : 'Browse doctors and take the first step. Your upcoming visits will appear here.'}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 sm:mt-5">
              {next ? <span className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-xs"><Clock3 className="size-4" />{slotDay(next.starts_at)}, {slotTime(next.starts_at)} · IST</span> : <span className="hidden text-xs text-white/85 sm:inline">For you and the people you care about</span>}
              <Link className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#075ac9]" href={next ? '/account' : '/search'}>{next ? 'View appointment' : 'Find a doctor'}<ArrowRight className="size-4" /></Link>
            </div>
          </div>
          <Link href="/pets" className="pet-discovery group hidden items-center gap-5 rounded-[1.5rem] border border-border p-6 sm:flex">
            <span className="flex size-16 shrink-0 items-center justify-center rounded-[1.3rem] bg-[#ffede5] text-[#b55a2f]"><PawPrint className="size-8" /></span>
            <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">Because they’re family, too</p><h2 className="mt-2 text-xl">A little care for your pet</h2><p className="mt-2 text-sm text-muted-foreground">Explore veterinary care <ArrowRight className="ml-1 inline size-4 transition-transform group-hover:translate-x-1" /></p></div>
          </Link>
        </section>

        <section><SectionHeading title="Medical specialties" href="/search" /><SpecialtyChips /></section>
        <section><SectionHeading title="Doctors to explore" subtitle="Compare experience, reviews and fees before you choose." href="/search?sort=rating" />
          {doctors.length ? <div className="provider-strip">{doctors.slice(0, 4).map(doctor => <ProviderCard key={doctor.id} doctor={doctor} variant="compact" />)}</div> : <EmptyProviders />}
        </section>

        <section className="grid gap-7 lg:grid-cols-[1.65fr_1fr]">
          <div className="min-w-0"><SectionHeading title="Find your doctor" subtitle="Add an area or PIN code to narrow your search." href="/search" /><div className="space-y-4">{doctors.slice(0, 3).map(doctor => <ProviderCard key={doctor.id} doctor={doctor} />)}{!doctors.length && <EmptyProviders />}</div></div>
          <aside className="space-y-5 lg:pt-1">
            <div className="rounded-[1.5rem] border border-border bg-soft/50 p-6"><span className="flex size-12 items-center justify-center rounded-2xl bg-card text-primary"><Video className="size-6" /></span><h2 className="mt-5 text-2xl">Care, wherever you are.</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">Explore doctors who offer scheduled video consultations. Check their profile to find the right fit.</p><Link href="/search?video=1" className="care-button mt-5 w-full">Explore video consultations<ArrowRight className="size-4" /></Link></div>
            <div className="rounded-[1.5rem] border border-border bg-card p-6"><h2 className="text-lg">A simpler way to find care</h2><ol className="mt-4 space-y-5">{[['01', 'Find your doctor', 'Search by specialty, name or location.'], ['02', 'Choose a time', 'Review the fee and available appointments.'], ['03', 'Track your visit', 'Check your request and confirmation in your account.']].map(([n,title,body]) => <li key={n} className="flex gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-soft text-xs font-bold text-primary">{n}</span><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{body}</p></div></li>)}</ol></div>
            <Link href="/join" className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-5 py-4 text-sm font-semibold">Are you a doctor or clinic?<ArrowRight className="size-4 text-primary" /></Link>
          </aside>
        </section>
      </div>
      <SiteFooter />
    </main>
  )
}

function SectionHeading({ title, subtitle, href }: { title: string; subtitle?: string; href: string }) {
  return <div className="mb-3 flex items-center justify-between gap-4 sm:mb-4"><div><h2 className="text-base sm:text-2xl">{title}</h2>{subtitle && <p className="mt-1.5 hidden text-xs leading-6 text-muted-foreground sm:block sm:text-sm">{subtitle}</p>}</div><Link href={href} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs font-semibold text-primary sm:text-sm">View all<ArrowRight className="size-3.5" /></Link></div>
}
function EmptyProviders() { return <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No doctors are listed yet. Please check back soon.</div> }
