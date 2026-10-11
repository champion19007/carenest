/** Operational telemetry is an allowlist. Clinical or authentication text never leaves here. */
const names=new Set(['Error','TypeError','RangeError','ReferenceError','SyntaxError','URIError','AggregateError','DomainError','DatabaseError','AbortError','TimeoutError'])
const states=new Set(['READY','DOWN','UNKNOWN','ACCEPTED','REJECTED','PENDING','FAILED','SENT','SKIPPED','UNAVAILABLE'])
export type LogDetails={count?:number;attempts?:number;durationMs?:number;status?:number;state?:string;requestId?:string}
function details(value:LogDetails={}){
 const out:Record<string,string|number>={}
 for(const key of ['count','attempts','durationMs','status'] as const){const n=value[key];if(typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e9)out[key]=n}
 if(value.state&&states.has(value.state))out.state=value.state
 if(value.requestId&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.requestId))out.requestId=value.requestId
 return out
}
function scope(value:string){return /^[a-z][a-z0-9_.-]{1,70}$/.test(value)?value:'runtime'}
export function errorName(error:unknown){try{return error instanceof Error&&names.has(error.name)?error.name:'Error'}catch{return 'Error'}}
function log(level:'info'|'warn'|'error',event:string,extra?:LogDetails,error?:unknown){
 try{const record={at:new Date().toISOString(),level,event:scope(event),...details(extra),...(level==='error'?{errorType:errorName(error)}:{})};console[level==='info'?'log':level](JSON.stringify(record))}catch{}
}
export const logEvent=(event:string,extra?:LogDetails)=>log('info',event,extra)
export const logWarn=(event:string,extra?:LogDetails)=>log('warn',event,extra)
export const reportError=(error:unknown,event:string,extra?:LogDetails)=>log('error',event,extra,error)

export function validSentryDsn(value?:string){
 try{if(!value)return false;const url=new URL(value);return url.protocol==='https:'&&url.hostname.endsWith('.sentry.io')&&/^[a-f0-9]+$/i.test(url.username)&&!url.password&&!url.port&&/^\/\d+$/.test(url.pathname)&&!url.search&&!url.hash}catch{return false}
}
/** Never forward request/user/breadcrumb/extra/context data, raw messages or source snippets. */
export function safeMonitoringEvent<T extends object>(event:T):T{
 try{
  const raw=event as Record<string,unknown>,exception=raw.exception as {values?:{type?:string;stacktrace?:{frames?:{lineno?:number;colno?:number;in_app?:boolean}[]}}[]}|undefined
  const safe:Record<string,unknown>={level:'error',message:'CareNest runtime error'}
  if(typeof raw.event_id==='string'&&/^[a-f0-9]{32}$/i.test(raw.event_id))safe.event_id=raw.event_id
  if(typeof raw.timestamp==='number'&&Number.isFinite(raw.timestamp))safe.timestamp=raw.timestamp
  const values=exception?.values?.slice(0,3).map(value=>({type:names.has(value.type??'')?value.type:'Error',value:'CareNest runtime error',stacktrace:{frames:(value.stacktrace?.frames??[]).filter(frame=>frame.in_app).slice(-40).map(frame=>({filename:'[application source]',in_app:true,...(Number.isInteger(frame.lineno)?{lineno:frame.lineno}:{}),...(Number.isInteger(frame.colno)?{colno:frame.colno}:{})}))}}))
  if(values?.length)safe.exception={values}
  return safe as T
 }catch{return {level:'error',message:'CareNest runtime error'} as T}
}
