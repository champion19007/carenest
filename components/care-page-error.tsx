'use client'
import Link from 'next/link'
export function CarePageError({reset}:{reset:()=>void}){
 return <section className="care-container py-12" role="alert"><h1 className="text-2xl">We couldn’t load your care requests</h1><p className="mt-4 max-w-xl text-muted-foreground">Please try again. If you were saving a request, check your request history before submitting it again.</p><div className="mt-6 flex flex-wrap gap-3"><button type="button" className="care-button" onClick={reset}>Try again</button><Link className="care-secondary" href="/account/home-care">Check my requests</Link><Link className="care-secondary" href="/help">Get help</Link></div></section>
}
