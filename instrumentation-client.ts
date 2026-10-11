import {setClientErrorReporter} from '@/lib/client-reporting'
import {safeMonitoringEvent,validSentryDsn} from '@/lib/observability'
const dsn=process.env.NEXT_PUBLIC_SENTRY_DSN
if(validSentryDsn(dsn)){
 void import('@sentry/nextjs').then(Sentry=>{
  Sentry.init({dsn,defaultIntegrations:false,integrations:[Sentry.globalHandlersIntegration()],sendDefaultPii:false,tracesSampleRate:0,replaysSessionSampleRate:0,replaysOnErrorSampleRate:0,beforeSend:(event,hint)=>{hint.attachments=[];return safeMonitoringEvent(event)},beforeSendTransaction:()=>null,beforeBreadcrumb:()=>null})
  setClientErrorReporter(()=>{Sentry.captureException(new Error('CareNest runtime error'))})
 }).catch(()=>{})
}
