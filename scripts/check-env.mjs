import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {parseEnv} from 'node:util'
const require=createRequire(import.meta.url)
export function inspectEnvironment(env,{production=false}={}){
 const problems=[],warnings=[],ok=[]
 const fail=(name,message)=>problems.push({name,message}),pass=name=>ok.push(name),warn=(name,message)=>warnings.push({name,message})
 if(production){
  let db;try{db=new URL(env.DATABASE_URL??'')}catch{}
  if(!db||!['postgres:','postgresql:'].includes(db.protocol)||!db.hostname||db.pathname==='/')fail('DATABASE_URL','A PostgreSQL connection with a database name is required.')
  else if(['localhost','127.0.0.1','::1','[::1]','host.docker.internal'].includes(db.hostname))fail('DATABASE_URL','A hosted deployment cannot use a laptop database address.')
  else pass('DATABASE_URL')
  if((env.AUTH_SECRET??env.JWT_SECRET??'').length<32)fail('AUTH_SECRET','Use at least 32 random characters.');else pass('AUTH_SECRET')
  if(!/^[a-f0-9]{64}$/i.test(env.DATA_ENCRYPTION_KEY??''))fail('DATA_ENCRYPTION_KEY','Use exactly 64 hexadecimal characters.');else pass('DATA_ENCRYPTION_KEY')
  if(env.CARENEST_LOCAL_MODE==='1')fail('CARENEST_LOCAL_MODE','Disable local mode on the hosting platform.')
  for(const name of ['APP_ORIGIN','APP_URL']){try{const url=new URL(env[name]);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error();pass(name)}catch{fail(name,'Use the trusted HTTPS site origin.') }}
 }else pass('Local mode uses separately backed-up embedded data and keys')
 if(env.SMS_PROVIDER==='twilio-verify'){
  for(const [name,prefix]of [['TWILIO_ACCOUNT_SID','AC'],['TWILIO_API_KEY_SID','SK'],['TWILIO_VERIFY_SERVICE_SID','VA']])if(!new RegExp('^'+prefix+'[a-f0-9]{32}$','i').test(env[name]??''))fail(name,'The provider identifier is missing or malformed.');else pass(name)
  if((env.TWILIO_API_KEY_SECRET??'').length<16)fail('TWILIO_API_KEY_SECRET','Save the private provider secret.')
  if(env.TWILIO_VERIFY_ENABLED!=='1')fail('TWILIO_VERIFY_ENABLED','Selected Verify sending is not enabled.')
 }else warn('SMS_PROVIDER','Check the explicitly selected provider before phone delivery tests.')
 if(env.EMAIL_ENABLED==='1'){
  if(env.EMAIL_PROVIDER==='gmail'){
   if(!/^[^\s@]+@gmail\.com$/i.test(env.GMAIL_SENDER_EMAIL??''))fail('GMAIL_SENDER_EMAIL','Choose the Gmail account that owns the app password.')
   if(!/^[a-z0-9]{16}$/i.test((env.GMAIL_APP_PASSWORD??'').replace(/\s/g,'')))fail('GMAIL_APP_PASSWORD','Save the 16-character app password privately.')
   else pass('Gmail sender configuration')
  }else if(env.EMAIL_PROVIDER!=='resend'||!env.RESEND_API_KEY||!env.EMAIL_FROM)fail('EMAIL_PROVIDER','Choose a configured Gmail or Resend sender.')
 }
 if(env.WHATSAPP_PROVIDER==='meta'){
  for(const name of ['WHATSAPP_PHONE_NUMBER_ID','META_WHATSAPP_BUSINESS_ACCOUNT_ID'])if(!/^\d{5,30}$/.test(env[name]??''))fail(name,'Save the sending-account identifier.')
  if((env.META_WHATSAPP_ACCESS_TOKEN??'').length<30)fail('META_WHATSAPP_ACCESS_TOKEN','Save a valid private access token.')
  for(const name of ['META_WHATSAPP_BOOKING_TEMPLATE','META_WHATSAPP_REMINDER_TEMPLATE','META_WHATSAPP_TRANSACTION_TEMPLATE'])if(!/^[a-z][a-z0-9_]{1,511}$/.test(env[name]??''))fail(name,'Save the exact approved template name.');else warn(name,'Configured by name; approval must be checked with Meta.')
 }
 if(env.ENABLE_PAYMENTS==='1'&&(!env.CASHFREE_CLIENT_ID||!env.CASHFREE_CLIENT_SECRET||env.CASHFREE_ENV!=='sandbox'))fail('Cashfree','The MVP requires sandbox credentials and sandbox mode.')
 if(env.CARENEST_DEMO_BOOKING==='1'&&(env.ENABLE_PAYMENTS!=='1'||env.CASHFREE_ENV!=='sandbox'||!env.CASHFREE_CLIENT_ID||!env.CASHFREE_CLIENT_SECRET))fail('CARENEST_DEMO_BOOKING','Hosted sample booking requires configured Cashfree sandbox checkout.')
 if(env.CARENEST_DEMO_VIDEO==='1'){
  let url;try{url=new URL(env.LIVEKIT_URL)}catch{}
  if(env.CARENEST_DEMO_BOOKING!=='1'||!url||url.protocol!=='wss:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!env.LIVEKIT_API_KEY||(env.LIVEKIT_API_SECRET??'').length<32||!/^[A-Za-z0-9_-]{1,128}$/.test(env.CARENEST_DEMO_VIDEO_HOST_ID??''))fail('CARENEST_DEMO_VIDEO','Hosted sample video requires sandbox booking, a designated account and secure LiveKit credentials.')
 }
 if(env.SENTRY_DSN||env.NEXT_PUBLIC_SENTRY_DSN){for(const name of ['SENTRY_DSN','NEXT_PUBLIC_SENTRY_DSN'])try{const url=new URL(env[name]);if(url.protocol!=='https:'||!url.hostname.endsWith('.sentry.io')||!/^[a-f0-9]+$/i.test(url.username)||url.password||url.port||!/^\/\d+$/.test(url.pathname)||url.search||url.hash)throw new Error();pass(name)}catch{fail(name,'Use the DSN from a separate CareNest Sentry project.')}}else warn('Sentry','Error monitoring is not connected to a project yet.')
 return {production,ok,problems,warnings,passed:problems.length===0}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),production=args.includes('--production'),fileArg=args.find(a=>a.startsWith('--file='))?.slice(7)
 let env={...process.env}
 if(fileArg){const file=path.resolve(fileArg);if(!fs.existsSync(file))throw new Error('Selected private environment file does not exist.');const parsed=parseEnv(fs.readFileSync(file,'utf8'));env={...parsed,...process.env}}
 else if(!production){require('@next/env').loadEnvConfig(process.cwd());env={...process.env}}
 const report=inspectEnvironment(env,{production});console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1
}
