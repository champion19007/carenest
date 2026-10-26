'use client'
import Link from 'next/link'
import {useActionState,useState} from 'react'
import {ArrowRight,CheckCircle2} from 'lucide-react'
import {submitHomeCare,cancelHomeCare,reviewHomeCare} from '@/app/actions/home-care'
import {CARE_WINDOWS,HOME_CARE_SERVICES,careServiceName,type HomeCareService,type CareAudience} from '@/lib/home-care'

export function HomeCareRequestForm({requestKey,initialService,initialAudience,family,pets,today}:{requestKey:string;initialService:HomeCareService;initialAudience:CareAudience;family:{id:string;name:string}[];pets:{id:string;name:string}[];today:string}){
 const [service,setService]=useState(initialService),[audience,setAudience]=useState(initialAudience)
 const [state,action,pending]=useActionState(submitHomeCare,{})
 if(state.id)return <div role="status" className="care-panel p-6 sm:p-8"><CheckCircle2 className="size-8 text-success"/><h2 className="mt-4 text-2xl">Request received</h2><p className="mt-3 text-muted-foreground">{state.notice} This is not a confirmed appointment or reserved stay. Check your requests for a review response.</p><Link href="/account/home-care" className="care-button mt-6">View my requests<ArrowRight className="size-4"/></Link></div>
 // A returned validation error still completes a server action; keep the user's draft when React resets the form.
 return <form action={action} onReset={event=>event.preventDefault()} className="care-panel space-y-6 p-5 sm:p-8">
  <input type="hidden" name="requestKey" value={requestKey}/>
  <fieldset><legend className="mb-3 text-sm font-semibold">Who needs care?</legend><div className="care-segments">{(['human','pet'] as const).map(kind=><label key={kind} className={audience===kind?'selected':''}><input type="radio" name="audience" value={kind} checked={audience===kind} onChange={()=>setAudience(kind)}/>{kind==='human'?'A person':'A pet'}</label>)}</div></fieldset>
  <label className="block text-sm font-medium">Service<select className="field mt-2" name="service" value={service} onChange={e=>setService(e.target.value as HomeCareService)}>{HOME_CARE_SERVICES.map(s=><option key={s} value={s}>{careServiceName(s,audience)}</option>)}</select></label>
  {audience==='human'?<label className="block text-sm font-medium">Person receiving care<select name="familyId" className="field mt-2"><option value="">Myself</option>{family.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>:<div><label className="block text-sm font-medium">Pet receiving care<select name="petId" className="field mt-2" required defaultValue=""><option value="" disabled>Choose your pet</option>{pets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{!pets.length&&<p className="mt-2 text-sm text-muted-foreground"><Link href="/account/pets" className="underline">Add your pet</Link> before making a request.</p>}</div>}
  <div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium">City<input className="field mt-2" name="city" required minLength={2} maxLength={100} autoComplete="address-level2"/></label><label className="block text-sm font-medium">PIN code<input className="field mt-2" name="pin" required inputMode="numeric" pattern="[1-9][0-9]{5}" maxLength={6} autoComplete="postal-code"/></label></div>
  <div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium">{service==='care_home'?'Stay starts':'Preferred date'}<input className="field mt-2" type="date" name="startsOn" required min={today} defaultValue={today}/></label>{service==='care_home'?<label className="block text-sm font-medium">Stay ends<input className="field mt-2" type="date" name="endsOn" required min={today}/></label>:<label className="block text-sm font-medium">Preferred time (IST)<select className="field mt-2" name="timeWindow" defaultValue="flexible">{CARE_WINDOWS.map(w=><option key={w} value={w}>{w==='flexible'?'Flexible':w[0].toUpperCase()+w.slice(1)}</option>)}</select></label>}</div>
  {service==='care_home'&&<input type="hidden" name="timeWindow" value="flexible"/>}
  <div><label className="block text-sm font-medium">What support is needed? <span className="font-normal text-muted-foreground">(optional)</span><textarea name="notes" className="field mt-2 min-h-28" rows={4} maxLength={1200} aria-describedby="care-notes-help"/></label><p id="care-notes-help" className="mt-2 text-sm text-muted-foreground">Briefly describe mobility, nursing or stay requirements. Please avoid uploading identity or payment details.</p></div>
  <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-5 shrink-0" required name="consent"/><span>I agree to share this request with CareNest’s care coordination team for review and contact. <Link className="underline" href="/policies/privacy">Privacy policy</Link></span></label>
  {state.error&&<p role="alert" className="care-feedback">{state.error}</p>}
  <p className="text-sm text-muted-foreground">No payment is taken. Service availability, suitability and a quote must be reviewed before care can be arranged. For urgent care, contact a local emergency service.</p>
  <button className="care-button w-full sm:w-auto" disabled={pending||(audience==='pet'&&!pets.length)}>{pending?'Saving request…':'Send care request'}<ArrowRight className="size-4"/></button>
 </form>
}

export function HomeCareControls({id,revision,status,admin=false}:{id:string;revision:number;status:string;admin?:boolean}){
 const [state,action,pending]=useActionState(admin?reviewHomeCare:cancelHomeCare,{})
 const transitions:Record<string,string[]>={REQUESTED:['REVIEWING'],REVIEWING:['CONTACTED','CLOSED'],CONTACTED:['CLOSED']}
 if(['CLOSED','CANCELLED'].includes(status)||(!admin&&state.notice))return state.notice?<p role="status" className="mt-4 text-sm">{state.notice}</p>:null
 return <form action={action} className="mt-5 space-y-3"><input type="hidden" name="id" value={id}/><input type="hidden" name="revision" value={revision}/>{state.notice&&<p role="status" className="text-sm">{state.notice}</p>}{admin&&<><label className="block text-sm">Review status<select key={status} name="next" className="field mt-2">{(transitions[status]??[]).map(s=><option key={s} value={s}>{s==='REVIEWING'?'Start review':s==='CONTACTED'?'Record response':'Close request'}</option>)}</select></label><label className="block text-sm">Response visible to the patient<textarea className="field mt-2" name="note" required minLength={5} maxLength={1000} rows={3}/></label></>}{state.error&&<p role="alert" className="care-feedback">{state.error}</p>}<button disabled={pending} className={admin?'care-button':'care-secondary'}>{pending?'Saving…':admin?'Save review':'Cancel request'}</button></form>
}
