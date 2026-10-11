'use client'
import {useActionState,useState} from 'react'
import {saveProviderDraft,submitProviderDraft,type ProviderState} from '@/app/actions/providers'
import {FileUpload} from './file-upload'
import {KYC_EVIDENCE} from '@/lib/kyc'
import {PET_SPECIES} from '@/lib/species'
const fields=[['name','Practitioner name'],['speciality','Specialty'],['qualification','Qualifications'],['registration','Professional registration number'],['council','Registering council'],['clinic','Clinic name'],['address','Clinic address'],['city','City'],['pin','PIN code'],['languages','Languages, comma separated'],['fee','Consultation fee (whole rupees)'],['experience','Years of experience']] as const
type Props={applicationId?:string;revision?:number;initial?:Record<string,unknown>;files?:{evidence_kind:string|null;state:string}[];pdfEnabled?:boolean}
export function ProviderApplicationForm({applicationId,initial,revision=0,files=[],pdfEnabled=false}:Props){
 const [state,action,pending]=useActionState(saveProviderDraft,{} as ProviderState)
 const [submitted,submit,submitPending]=useActionState(submitProviderDraft,{} as ProviderState)
 const [uploaded,setUploaded]=useState<Record<string,string>>({})
 const [kind,setKind]=useState(String(initial?.kind??'human'))
 const id=state.applicationId??applicationId,currentRevision=state.revision??revision
 return <div className="space-y-6">
  <section className="rounded-2xl border bg-card p-5">
   <h2 className="text-xl">1. Professional and clinic details</h2>
   <form action={action} className="mt-4">
    <div className="grid gap-4 sm:grid-cols-2">{fields.map(([name,label])=><label key={name} className="text-sm">{label}<input name={name} defaultValue={String(initial?.[name]??'')} required type={['fee','experience'].includes(name)?'number':'text'} min="0" maxLength={300} className="field mt-2"/></label>)}
     <label>Provider type<select name="kind" value={kind} onChange={event=>setKind(event.target.value)} className="field mt-2"><option value="human">Human healthcare</option><option value="vet">Veterinary care</option></select></label>
     {kind==='vet'&&<fieldset className="min-w-0"><legend className="text-sm">Species you treat</legend><div className="flex flex-wrap gap-3">{PET_SPECIES.map(species=><label key={species} className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="supportedSpecies" value={species} defaultChecked={Array.isArray(initial?.supportedSpecies)?initial.supportedSpecies.includes(species):['dog','cat'].includes(species)}/>{species}</label>)}</div></fieldset>}
    </div>
    <p role="status" className="mt-4 text-sm">{state.error??state.notice}</p><button disabled={pending} className="care-button mt-4">{pending?'Saving…':'Save verification draft'}</button>
   </form>
  </section>
  {id&&<>
   <section className="rounded-2xl border bg-card p-5"><h2 className="text-xl">2. Private verification documents</h2><p className="mt-3 text-sm">Documents are encrypted and available only to you and authorised reviewers. Upload each category separately.</p>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">{KYC_EVIDENCE.map(item=>{const ready=(uploaded[item.kind]??files.find(file=>file.evidence_kind===item.kind)?.state)==='CLEAN';return <section key={item.kind} className="min-w-0 rounded-xl bg-surface p-4"><h3 className="font-semibold">{item.label}</h3><p className="mt-2 text-xs leading-6 text-muted-foreground">{item.hint}</p><p className="mt-2 text-xs font-semibold">{ready?'Uploaded and safety checked':'Required before submission'}</p><FileUpload applicationId={id} evidenceKind={item.kind} allowPdf={pdfEnabled} onUploaded={fileState=>setUploaded(current=>({...current,[item.kind]:fileState}))}/></section>})}</div>
   </section>
   <form action={submit} className="space-y-4 rounded-2xl border bg-card p-5"><h2 className="text-xl">3. Submit for review</h2><input name="applicationId" type="hidden" value={id}/><input name="revision" type="hidden" value={currentRevision}/>
    <p className="text-sm">The reviewer checks your identity, council registration, qualifications supporting the claimed specialty, and clinic affiliation. You cannot accept appointments until your profile is approved.</p>
    <label className="flex gap-3 text-sm leading-6"><input name="attested" required type="checkbox" className="mt-1"/>I confirm that these details and documents are accurate, and authorise CareNest to review them for professional verification.</label>
    <button disabled={submitPending||pending} className="care-button">{submitPending?'Submitting…':'Submit for verification'}</button><p role="status" className="text-sm">{submitted.error??submitted.notice}</p>
   </form>
  </>}
 </div>
}
