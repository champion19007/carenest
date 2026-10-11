import test from 'node:test'
import assert from 'node:assert/strict'
import {logEvent,logWarn,reportError,safeMonitoringEvent,validSentryDsn} from '../lib/observability.ts'
test('operational logs discard messages, identifiers and unrecognised fields',()=>{
 const original={log:console.log,warn:console.warn,error:console.error},lines=[];for(const key of Object.keys(original))console[key]=value=>lines.push(JSON.parse(value))
 try{
  const patient={email:'private@example.test',phone:'9000000001',notes:'Private symptom',token:'private-secret',state:'ACCEPTED',count:2}
  logEvent('payment.receipt_accepted',patient);logWarn('worker.retry',{attempts:2});reportError(new Error('Private symptom and private-secret'),'email.provider_failed',patient)
  const text=JSON.stringify(lines);for(const value of ['private@example.test','9000000001','Private symptom','private-secret'])assert.equal(text.includes(value),false)
  assert.equal(lines[0].state,'ACCEPTED');assert.equal(lines[0].count,2);assert.equal(lines[2].errorType,'Error')
  console.error=()=>{throw new Error('Logger unavailable')};assert.doesNotThrow(()=>reportError(new Error('Private'),'worker.failed'))
 }finally{Object.assign(console,original)}
})
test('Sentry export is an allowlist even for nested clinical, request or SDK payloads',()=>{
 const event={event_id:'a'.repeat(32),timestamp:1234,user:{email:'private@example.test',ip_address:'127.0.0.1'},request:{url:'https://host/consult/patient?token=secret',data:{diagnosis:'Private symptom'}},breadcrumbs:[{message:'private'}],contexts:{clinical:{notes:'private'}},extra:{password:'private'},transaction:'/doctor/private-name',message:'Private symptom',exception:{values:[{type:'TypeError',value:'Private symptom',stacktrace:{frames:[{filename:'/private/patient-name/report.js',function:'Private patient',context_line:'private-secret',lineno:12,colno:5,in_app:true}]}}]}}
 const safe=safeMonitoringEvent(event),text=JSON.stringify(safe)
 for(const value of ['private','patient-name','Private symptom','secret','127.0.0.1'])assert.equal(text.includes(value),false)
 assert.equal(safe.exception.values[0].type,'TypeError');assert.equal(safe.exception.values[0].stacktrace.frames[0].lineno,12);assert.equal(safe.message,'CareNest runtime error');assert.equal(safe.user,undefined);assert.equal(safe.request,undefined)
 const evil={get exception(){throw new Error('Private')}};assert.doesNotThrow(()=>safeMonitoringEvent(evil))
})
test('monitoring cannot redirect telemetry to an arbitrary endpoint or query-bearing DSN',()=>{
 assert.equal(validSentryDsn('https://'+'a'.repeat(32)+'@o123.ingest.de.sentry.io/456'),true)
 for(const value of [undefined,'not-a-dsn','https://key@attacker.example/123','http://key@o1.ingest.sentry.io/123','https://key:secret@o1.ingest.sentry.io/123','https://key@o1.ingest.sentry.io/123?token=secret'])assert.equal(validSentryDsn(value),false)
})
