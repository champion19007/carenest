import Link from 'next/link'
import {currentAdmin} from '@/lib/auth'
import {redirect} from 'next/navigation'
import {getDb,ensureSchema} from '@/lib/db/client'
import {ProviderReviewForm} from '@/components/provider-review-form'
import {KYC_EVIDENCE} from '@/lib/kyc'
export const dynamic='force-dynamic'
type Application={id:string;draft:Record<string,unknown>;status:string;revision:number;reason:string|null;evidence_snapshot:Record<string,string>|null}
export default async function ReviewProviders(){
 if(!await currentAdmin())redirect('/admin');await ensureSchema()
 const applications=await getDb().query<Application>("SELECT id,draft,status,revision,reason,evidence_snapshot FROM provider.applications WHERE status<>'DRAFT' ORDER BY (status='SUBMITTED') DESC,submitted_at DESC LIMIT 100")
 const files=await getDb().query<{id:string;application_id:string;state:string;evidence_kind:string|null}>('SELECT id,application_id,state,evidence_kind FROM private_files WHERE application_id=ANY($1::text[])',[applications.map(item=>item.id)])
 return <main className="care-container py-8">
  <Link href="/admin" className="text-primary">← Admin</Link><h1 className="mt-5 text-3xl">Doctor and veterinarian verification</h1>
  <p className="mt-4 max-w-3xl text-sm leading-7">Review identity, council registration, qualifications supporting the claimed specialty, and clinic evidence before making a practitioner bookable.</p>
  <div className="mt-6 space-y-5">{applications.map(application=><section key={application.id} className="rounded-2xl border bg-card p-5">
   <h2 className="text-xl">{String(application.draft.name)} · {application.status}</h2>
   <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">{[['speciality','Specialty'],['qualification','Qualifications'],['registration','Registration'],['council','Council'],['clinic','Clinic'],['address','Address'],['city','City'],['pin','PIN code']].map(([key,label])=><div key={key}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{String(application.draft[key]??'')}</dd></div>)}</dl>
   <p className="mt-4 flex flex-wrap gap-4 text-sm"><a href={application.draft.kind==='vet'?'https://vci.dahd.gov.in/ivpr':'https://nmr.nmc.org.in/search-doctor'} target="_blank" rel="noopener noreferrer" className="text-primary">Open national register</a><span>Use the relevant state/dental/other council where appropriate.</span></p>
   <ul className="mt-4 space-y-2 text-sm">{KYC_EVIDENCE.map(item=>{const proof=files.find(file=>file.id===application.evidence_snapshot?.[item.kind]&&file.application_id===application.id);return <li key={item.kind}>{item.label}: {proof?<><span>{proof.state}</span>{proof.state==='CLEAN'&&<a className="ml-3 inline-flex min-h-11 items-center text-primary" href={'/api/files/'+encodeURIComponent(proof.id)} target="_blank" rel="noopener noreferrer">Open submitted document</a>}</>:<span className="text-warning">Missing from submitted evidence</span>}</li>})}</ul>
   {application.reason&&<p className="mt-4 text-sm">{application.reason}</p>}
   {application.status==='SUBMITTED'&&<ProviderReviewForm id={application.id} revision={application.revision}/>}
  </section>)}{!applications.length&&<p className="text-sm">No verification cases have been submitted.</p>}</div>
 </main>
}
