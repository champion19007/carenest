/** Pure configuration checks: safe to use before any database or provider call. */
export type DeploymentIssue='DATABASE_MISSING'|'DATABASE_INVALID'|'AUTH_SECRET_MISSING'|'ENCRYPTION_KEY_MISSING'|'LOCAL_MODE_ON_HOST'
export function deploymentIssue(env:NodeJS.ProcessEnv=process.env):DeploymentIssue|null{
 const hosted=env.VERCEL==='1',local=env.CARENEST_LOCAL_MODE==='1'
 if(hosted&&local)return 'LOCAL_MODE_ON_HOST'
 if(!hosted&&(local||env.NODE_ENV!=='production'))return null
 if(!env.DATABASE_URL?.trim())return 'DATABASE_MISSING'
 try{const url=new URL(env.DATABASE_URL);if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.pathname||url.pathname==='/')return 'DATABASE_INVALID'}catch{return 'DATABASE_INVALID'}
 if((env.AUTH_SECRET??env.JWT_SECRET??'').length<32)return 'AUTH_SECRET_MISSING'
 if(!/^[a-f0-9]{64}$/i.test(env.DATA_ENCRYPTION_KEY??''))return 'ENCRYPTION_KEY_MISSING'
 return null
}
