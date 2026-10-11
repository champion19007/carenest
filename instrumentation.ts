import type {Instrumentation} from 'next'
import {logWarn,reportError,safeMonitoringEvent,validSentryDsn} from '@/lib/observability'
export async function register(){
 const dsn=process.env.SENTRY_DSN??process.env.NEXT_PUBLIC_SENTRY_DSN
 if(!dsn)return
 if(!validSentryDsn(dsn)){logWarn('monitoring.configuration_invalid');return}
 try{
  const Sentry=await import('@sentry/nextjs')
  Sentry.init({dsn,environment:process.env.VERCEL_ENV??process.env.NODE_ENV,release:process.env.VERCEL_GIT_COMMIT_SHA,defaultIntegrations:false,integrations:[],sendDefaultPii:false,tracesSampleRate:0,profilesSampleRate:0,beforeSend:(event,hint)=>{hint.attachments=[];return safeMonitoringEvent(event)},beforeSendTransaction:()=>null,beforeBreadcrumb:()=>null})
 }catch{logWarn('monitoring.initialization_failed')}
}
export const onRequestError:Instrumentation.onRequestError=async(error)=>{
 reportError(error,'server.request_failed')
 if(!validSentryDsn(process.env.SENTRY_DSN??process.env.NEXT_PUBLIC_SENTRY_DSN))return
 try{const Sentry=await import('@sentry/nextjs');Sentry.captureException(new Error('CareNest runtime error'));await Sentry.flush(1000)}catch{}
}
