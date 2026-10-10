'use client'
import Link from 'next/link'
import {Logo} from '@/components/logo'
export default function ErrorPage({reset}:{error:Error&{digest?:string};reset:()=>void}){
 return <main className="min-h-screen bg-surface px-5 py-8"><div className="mx-auto max-w-xl"><Logo/><section className="mt-12 rounded-3xl border border-border bg-card p-7"><h1 className="text-3xl">CareNest is temporarily unavailable</h1><p role="alert" className="mt-4 text-sm leading-7 text-muted-foreground">We couldn’t load this page. Please try again in a moment. If you were paying for an appointment, check its payment status before starting another payment.</p><div className="mt-6 flex flex-wrap gap-3"><button onClick={reset} className="care-button">Try again</button><Link href="/help" className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold">Help centre</Link></div></section></div></main>
}
