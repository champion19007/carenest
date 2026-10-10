'use client'
import {useState} from 'react'
type Props={applicationId?:string;encounterId?:string;labOrderId?:string;evidenceKind?:string;allowPdf?:boolean;onUploaded?:(state:string)=>void}
export function FileUpload({applicationId,encounterId,labOrderId,evidenceKind,allowPdf=true,onUploaded}:Props){
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 return <form className="mt-4 rounded-xl border border-border p-4" onSubmit={async event=>{
  event.preventDefault();setBusy(true)
  try{
   const response=await fetch('/api/files/upload',{method:'POST',body:new FormData(event.currentTarget)}),body=await response.json()
   setMessage(response.ok?(evidenceKind?'Document uploaded. ':'File saved: '+body.id+'. ')+(body.state==='CLEAN'?'Ready for authorized access.':'Quarantined until a successful scanner check.'):body.error)
   if(response.ok)onUploaded?.(body.state)
  }catch{setMessage('Upload failed. Try again.')}finally{setBusy(false)}
 }}>
  <p className="text-sm font-semibold">Private attachment</p>
  <p className="mt-2 text-xs text-muted-foreground">{allowPdf?'PDF, JPEG or PNG, up to 10 MiB. PDFs need a configured safety scanner.':'JPEG or PNG, up to 10 MiB. PDF verification uploads are unavailable until a safety scanner is configured.'}</p>
  {applicationId&&<input name="applicationId" type="hidden" value={applicationId}/>}
  {encounterId&&<input name="encounterId" type="hidden" value={encounterId}/>}
  {labOrderId&&<input name="labOrderId" type="hidden" value={labOrderId}/>}
  {evidenceKind&&<input name="evidenceKind" type="hidden" value={evidenceKind}/>}
  <input name="file" type="file" accept={allowPdf?'image/png,image/jpeg,application/pdf':'image/png,image/jpeg'} required className="mt-3 block w-full text-sm"/>
  <button disabled={busy} className="care-button mt-3">{busy?'Uploading…':'Upload privately'}</button>
  <p role="status" className="mt-3 text-sm">{message}</p>
 </form>
}
