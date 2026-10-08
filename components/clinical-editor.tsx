'use client'
import {useActionState,useEffect,useState} from 'react'
import {saveChartNote,savePrescription,type ClinicalState} from '@/app/actions/care'
import {FileUpload} from './file-upload'
export function ClinicalEditor({encounterId,patientName,initialNoteKey,initialRxKey}:{encounterId:string;patientName:string;initialNoteKey:string;initialRxKey:string}) {
 const [note,noteAction,notePending]=useActionState(saveChartNote,{} as ClinicalState)
 const [rx,rxAction,rxPending]=useActionState(savePrescription,{} as ClinicalState)
 const [noteDirty,setNoteDirty]=useState(false),[rxDirty,setRxDirty]=useState(false),dirty=noteDirty||rxDirty
 const [noteKey,setNoteKey]=useState(initialNoteKey),[rxKey,setRxKey]=useState(initialRxKey)
 useEffect(()=>{
  if(!dirty)return
  const unload=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''}
  const click=(e:MouseEvent)=>{const target=e.target as Element;const link=target.closest('a[href]');if(link&&!window.confirm('Leave this encounter and discard the unsaved draft?'))e.preventDefault()}
  window.addEventListener('beforeunload',unload);document.addEventListener('click',click,true)
  return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',click,true)}
 },[dirty])
 useEffect(()=>{if(note.notice){setNoteDirty(false);setNoteKey(crypto.randomUUID())}},[note]);useEffect(()=>{if(rx.notice){setRxDirty(false);setRxKey(crypto.randomUUID())}},[rx])
 return <><div className="grid gap-5 lg:grid-cols-2"><form action={noteAction} onChange={()=>setNoteDirty(true)} className="rounded-2xl border border-border bg-card p-5"><h2 className="text-xl">Note for {patientName}</h2><input name="requestKey" type="hidden" value={noteKey}/><input name="encounterId" type="hidden" value={encounterId}/>{[['complaints','Complaints',2000],['observations','Observations',4000],['diagnosis','Assessment',2000]].map(([name,label,max])=><label key={String(name)} className="mt-4 block text-sm">{label}<textarea name={String(name)} maxLength={Number(max)} rows={3} className="field mt-2"/></label>)}<p role="status" className="mt-3 text-sm">{note.error??note.notice}</p><button disabled={notePending} className="care-button mt-4">{notePending?'Saving…':'Save signed note'}</button></form><form action={rxAction} onChange={()=>setRxDirty(true)} className="rounded-2xl border border-border bg-card p-5"><h2 className="text-xl">Prescription</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">The practitioner is responsible for medicine suitability and dosing. The app validates record structure and access.</p><input name="encounterId" type="hidden" value={encounterId}/><input name="requestKey" type="hidden" value={rxKey}/><PrescriptionDrugs/><label className="mt-4 block text-sm">Advice<textarea name="advice" maxLength={2000} rows={3} className="field mt-2"/></label><p role="status" className="mt-3 text-sm">{rx.error??rx.notice}</p><button disabled={rxPending} className="care-button mt-4">{rxPending?'Saving…':'Save signed prescription'}</button></form></div><FileUpload encounterId={encounterId}/></>
}
function PrescriptionDrugs() {
 const empty={drug:'',dose:'',frequency:'',intake:'',days:'1'}
 const [drugs,setDrugs]=useState([{...empty}])
 return <div className="mt-4 space-y-4"><input type="hidden" name="drugs" value={JSON.stringify(drugs)}/>{drugs.map((drug,index)=><fieldset key={index} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2"><legend className="px-2 text-sm">Medicine {index+1}</legend>{(Object.keys(empty) as (keyof typeof empty)[]).map(field=><label key={field} className="text-xs capitalize">{field==='days'?'Duration (days)':field}<input value={drug[field]} required={field!=='intake'} type={field==='days'?'number':'text'} min={field==='days'?1:undefined} max={field==='days'?365:undefined} maxLength={120} onChange={e=>setDrugs(drugs.map((d,i)=>i===index?{...d,[field]:e.target.value}:d))} className="field mt-1"/></label>)}</fieldset>)}{drugs.length<20&&<button type="button" className="min-h-11 text-sm font-semibold text-primary" onClick={()=>setDrugs([...drugs,{...empty}])}>Add another medicine</button>}</div>
}
