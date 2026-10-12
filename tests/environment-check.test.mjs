import test from 'node:test'
import assert from 'node:assert/strict'
import {inspectEnvironment} from '../scripts/check-env.mjs'
test('hosted preflight rejects laptop URLs and private settings without exposing their values',()=>{
 const env={DATABASE_URL:'postgresql://private-user:private-pass@localhost/carenest',AUTH_SECRET:'private-secret',DATA_ENCRYPTION_KEY:'private-key',APP_URL:'http://localhost:3000',APP_ORIGIN:'http://localhost:3000',CARENEST_LOCAL_MODE:'1'}
 const report=inspectEnvironment(env,{production:true});assert.equal(report.passed,false)
 for(const value of ['private-user','private-pass','private-secret','private-key'])assert.equal(JSON.stringify(report).includes(value),false)
 assert.ok(report.problems.some(p=>p.name==='DATABASE_URL'));assert.ok(report.problems.some(p=>p.name==='CARENEST_LOCAL_MODE'))
})
test('valid core settings pass without requiring optional providers, and selected provider mistakes fail',()=>{
 const env={DATABASE_URL:'postgresql://fixture:fixture@database.example.test/carenest?sslmode=require',AUTH_SECRET:'a'.repeat(48),DATA_ENCRYPTION_KEY:'b'.repeat(64),APP_URL:'https://carenest.example',APP_ORIGIN:'https://carenest.example'}
 assert.equal(inspectEnvironment(env,{production:true}).passed,true)
 assert.equal(inspectEnvironment({...env,CARENEST_DEMO_BOOKING:'1'},{production:true}).passed,false)
 assert.equal(inspectEnvironment({...env,CARENEST_DEMO_BOOKING:'1',ENABLE_PAYMENTS:'1',CASHFREE_ENV:'sandbox',CASHFREE_CLIENT_ID:'TEST_fixture',CASHFREE_CLIENT_SECRET:'fixture'},{production:true}).passed,true)
 const selected=inspectEnvironment({...env,SMS_PROVIDER:'twilio-verify',EMAIL_ENABLED:'1',EMAIL_PROVIDER:'gmail',GMAIL_APP_PASSWORD:'invalid'},{production:true});assert.equal(selected.passed,false);assert.ok(selected.problems.some(p=>p.name==='TWILIO_VERIFY_SERVICE_SID'))
 const dsn='https://'+'a'.repeat(32)+'@o123.ingest.de.sentry.io/456'
 assert.equal(inspectEnvironment({...env,SENTRY_DSN:dsn,NEXT_PUBLIC_SENTRY_DSN:dsn},{production:true}).passed,true)
 for(const invalid of [dsn.replace('/456','/not-a-project'),dsn.replace('sentry.io','sentry.io:8443'),dsn.replace('a'.repeat(32),'not-a-public-key')])assert.equal(inspectEnvironment({...env,SENTRY_DSN:invalid,NEXT_PUBLIC_SENTRY_DSN:invalid},{production:true}).passed,false)
})
test('hosted video preflight requires secure transport and a designated demo account',()=>{
 const env={DATABASE_URL:'postgresql://fixture:fixture@database.example.test/carenest',AUTH_SECRET:'a'.repeat(48),DATA_ENCRYPTION_KEY:'b'.repeat(64),APP_URL:'https://carenest.example',APP_ORIGIN:'https://carenest.example',ENABLE_PAYMENTS:'1',CASHFREE_ENV:'sandbox',CASHFREE_CLIENT_ID:'TEST_fixture',CASHFREE_CLIENT_SECRET:'fixture',CARENEST_DEMO_BOOKING:'1',CARENEST_DEMO_VIDEO:'1',CARENEST_DEMO_VIDEO_HOST_ID:'host-fixture',LIVEKIT_URL:'wss://fixture.livekit.cloud',LIVEKIT_API_KEY:'fixture',LIVEKIT_API_SECRET:'fixture-secret-'.repeat(3)}
 assert.equal(inspectEnvironment(env,{production:true}).passed,true)
 for(const patch of [{LIVEKIT_URL:'ws://127.0.0.1:7880'},{LIVEKIT_URL:'wss://localhost'},{LIVEKIT_URL:'wss://fixture.livekit.cloud/?key=fixture'},{CARENEST_DEMO_VIDEO_HOST_ID:''},{CARENEST_DEMO_BOOKING:'0'},{LIVEKIT_API_SECRET:'short'}])assert.equal(inspectEnvironment({...env,...patch},{production:true}).passed,false)
})
