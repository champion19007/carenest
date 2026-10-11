import {boundedText,reject} from './errors'
import type {KycReviewChecks} from '@/lib/kyc'
import {isPetSpecies} from '@/lib/species'
export type ProviderDraft={name:string;kind:'human'|'vet';speciality:string;qualification:string;registration:string;council:string;clinic:string;address:string;city:string;pin:string;fee:number;experience:number;languages:string;supportedSpecies:string[]}
export function parseProviderDraft(value:Record<string,unknown>):ProviderDraft {
 const fee=Number(value.fee),experience=Number(value.experience),kind=String(value.kind)
 if(!['human','vet'].includes(kind)||!Number.isInteger(fee)||fee<0||fee>1000000||!Number.isInteger(experience)||experience<0||experience>70)reject('VALIDATION','Check provider type, fee and experience.',400)
 const pin=boundedText(value.pin,6,6);if(!/^[1-9]\d{5}$/.test(pin))reject('VALIDATION','Enter a valid six-digit Indian PIN code.',400)
 const species=kind==='vet'?Array.isArray(value.supportedSpecies)?[...new Set(value.supportedSpecies.map(String))]:[]:[]
 if(kind==='vet'&&!species.length||species.some(s=>!isPetSpecies(s)))reject('VALIDATION','Choose at least one supported veterinary species from the list.',400)
 return {name:boundedText(value.name,80,2),kind:kind as 'human'|'vet',speciality:boundedText(value.speciality,100,2),qualification:boundedText(value.qualification,300,2),registration:boundedText(value.registration,80,2),council:boundedText(value.council,120,2),clinic:boundedText(value.clinic,120,2),address:boundedText(value.address,300,3),city:boundedText(value.city,80,2),pin,fee,experience,languages:boundedText(value.languages,200,2),supportedSpecies:species}
}
export function validateKycReview(decision:string,reason:string,checks:KycReviewChecks){
 if(!['APPROVED','REJECTED','NEEDS_CHANGES'].includes(decision))reject('VALIDATION','Choose a review decision.',400)
 boundedText(reason,1000,10)
 if(!Number.isInteger(checks.revision)||checks.revision<0)reject('REVISION','Refresh this verification case before reviewing.',400)
 if(decision!=='APPROVED')return
 if(checks.identityMatched!==true||checks.registrationChecked!==true||checks.qualificationMatched!==true||checks.clinicMatched!==true)reject('VERIFICATION','Complete the identity, registration, specialty qualification and clinic checks before approval.',400)
 boundedText(checks.sourceReference,300,5)
 let source:URL
 try{source=new URL(checks.sourceUrl)}catch{reject('VERIFICATION_SOURCE','Record the actual professional register URL.',400)}
 if(source.protocol!=='https:'||source.username||source.password||checks.sourceUrl.length>1000)reject('VERIFICATION_SOURCE','Use an HTTPS professional register URL without credentials.',400)
}
