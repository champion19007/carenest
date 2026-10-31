export const HOME_CARE_SERVICES = ['nursing','doctor_visit','care_home'] as const
export type HomeCareService = typeof HOME_CARE_SERVICES[number]
export type CareAudience = 'human'|'pet'
export const CARE_WINDOWS = ['flexible','morning','afternoon','evening'] as const
export const careStatuses:Record<string,string>={REQUESTED:'Awaiting review',REVIEWING:'Under review',CONTACTED:'Response recorded',CLOSED:'Closed',CANCELLED:'Cancelled'}
export function careDate(value:string){return new Date(value.slice(0,10)+'T12:00:00Z').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'})}
export function careServiceName(service:HomeCareService,audience:CareAudience){
 return ({nursing:audience==='pet'?'Veterinary nursing':'Nursing at home',doctor_visit:audience==='pet'?'Vet home visit':'Doctor home visit',care_home:audience==='pet'?'Pet boarding & assisted stays':'Residential care homes'})[service]
}
export const homeCareOptions = [
 {id:'nursing',label:'Nurses at home',petLabel:'Veterinary nursing',description:'Request nursing support, recovery visits or ongoing care.',petDescription:'Ask for nursing and recovery support from a veterinary care team.',detail:'Visit or ongoing support'},
 {id:'doctor_visit',label:'Doctor home visits',petLabel:'Vet home visits',description:'Find a doctor who offers visits at your address.',petDescription:'Find a veterinarian who offers home visits for your pet.',detail:'Scheduled home visit'},
 {id:'care_home',label:'Care homes',petLabel:'Pet stays & boarding',description:'Ask about short stays, elder care and residential nursing support.',petDescription:'Plan boarding or an assisted stay around your pet’s care needs.',detail:'Short or longer stays'},
] as const
