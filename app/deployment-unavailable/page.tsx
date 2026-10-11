import Link from 'next/link'
import {Heart,PawPrint,CalendarDays,Clock3} from 'lucide-react'
import {Logo} from '@/components/logo'
import {ThemeToggle} from '@/components/theme-toggle'
export const dynamic='force-dynamic'
export const metadata={title:'CareNest · Setup in progress',robots:{index:false,follow:false}}
export default function DeploymentUnavailable(){
 return <main className="min-h-screen bg-surface">
  <header className="care-container flex min-h-20 items-center justify-between gap-4"><Logo/><ThemeToggle compact/></header>
  <section className="care-container py-10 sm:py-20">
   <div className="mx-auto max-w-3xl rounded-3xl border border-border bg-card p-7 sm:p-12">
    <span className="inline-flex items-center gap-2 rounded-full bg-soft px-4 py-2 text-sm font-semibold text-primary"><Clock3 className="size-4"/>Setup in progress</span>
    <h1 className="mt-6 text-4xl sm:text-5xl">CareNest is getting ready</h1>
    <p role="status" className="mt-5 text-base leading-8 text-muted-foreground">We’re preparing care for you, your family and your pets. Online signup, appointments and payments are temporarily unavailable while we finish setting up this website.</p>
    <div className="mt-8 grid gap-4 sm:grid-cols-3">{[{Icon:Heart,title:'Family care',text:'Find care for the people you love.'},{Icon:PawPrint,title:'Pet care',text:'Keep veterinary care alongside family care.'},{Icon:CalendarDays,title:'Appointments',text:'Choose a time when booking becomes available.'}].map(({Icon,title,text})=><article key={title} className="rounded-2xl border border-border bg-background p-5"><Icon className="size-6 text-primary"/><h2 className="mt-4 text-lg">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></article>)}</div>
    <div className="mt-8 flex flex-wrap gap-3"><a href="/" className="care-button">Check again</a><Link href="/help" className="inline-flex min-h-11 items-center rounded-xl border border-border px-5 text-sm font-semibold">Visit the help centre</Link></div>
    <p className="mt-7 border-t border-border pt-5 text-sm leading-7 text-muted-foreground">For urgent care, contact a local medical or veterinary emergency service.</p>
   </div>
  </section>
 </main>
}
