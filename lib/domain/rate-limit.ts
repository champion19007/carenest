import 'server-only'
import { ensureSchema, getDb, type Db } from '@/lib/db/client'
import { privateKey } from '@/lib/secrets'
export type LimitPolicy = { bucket: string; key: string; limit: number; seconds: number }

/** All keys are decided before any is charged; rolling windows use database time. */
export async function consumeLimits(policies: LimitPolicy[], database?: Db) {
  if (!database) await ensureSchema()
  return (database ?? getDb()).transaction(async tx => {
    const clock = await tx.one<{ instant: string }>('SELECT now() AS instant')
    const now = new Date(clock!.instant).getTime()
    const states: { policy: LimitPolicy; key: string; events: string[] }[] = []
    for (const p of [...policies].sort((a,b)=>(a.bucket+a.key).localeCompare(b.bucket+b.key))) {
      if (!Number.isInteger(p.limit) || p.limit < 1 || p.limit > 10000 || p.seconds < 1 || p.seconds > 86400) throw new Error('Invalid rate policy')
      const key = privateKey('rate-limit',p.key)
      await tx.query('INSERT INTO rate_limits(bucket,key) VALUES($1,$2) ON CONFLICT DO NOTHING',[p.bucket,key])
      const row = await tx.one<{ events: string[] }>('SELECT events FROM rate_limits WHERE bucket=$1 AND key=$2 FOR UPDATE',[p.bucket,key])
      const events = (row?.events ?? []).filter(value=>new Date(value).getTime()>now-p.seconds*1000)
      states.push({policy:p,key,events})
    }
    let retryAfterSeconds=0
    for (const state of states) if (state.events.length>=state.policy.limit) {
      retryAfterSeconds=Math.max(retryAfterSeconds,Math.ceil((new Date(state.events[state.events.length-state.policy.limit]).getTime()+state.policy.seconds*1000-now)/1000))
    }
    if (retryAfterSeconds>0) return { allowed:false,remaining:0,retryAfterSeconds }
    for (const state of states) await tx.query('UPDATE rate_limits SET events=$3::timestamptz[],count=$4,window_start=$5 WHERE bucket=$1 AND key=$2',
      [state.policy.bucket,state.key,[...state.events,new Date(now).toISOString()],state.events.length+1,new Date(now).toISOString()])
    return { allowed:true,remaining:Math.min(...states.map(s=>s.policy.limit-s.events.length-1)),retryAfterSeconds:0 }
  })
}
