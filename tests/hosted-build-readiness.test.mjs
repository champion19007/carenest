import test from 'node:test'
import assert from 'node:assert/strict'
import {loadServices} from './service-loader.mjs'

test('configured hosted builds do not connect to PostgreSQL to enumerate sitemap routes',async()=>{
 const env={...process.env};Object.assign(process.env,{NODE_ENV:'production',VERCEL:'1',CARENEST_LOCAL_MODE:'0',CARENEST_BUILD_PHASE:'1',DATABASE_URL:'postgresql://fixture:fixture@unreachable.example.test/carenest',AUTH_SECRET:'a'.repeat(48),DATA_ENCRYPTION_KEY:'b'.repeat(64),APP_ORIGIN:'https://carenest.example.test'})
 let reads=0;const db={one:async()=>{reads++;throw new Error('Database unavailable')},query:async()=>{reads++;throw new Error('Database unavailable')}}
 try{
  const sitemap=loadServices(db)('app/sitemap.ts');assert.deepEqual(await sitemap.generateSitemaps(),[{id:0}]);assert.deepEqual(await sitemap.default({id:Promise.resolve('0')}),[]);assert.equal(reads,0)
  delete process.env.CARENEST_BUILD_PHASE
  db.one=async()=>{reads++;return {n:'50001'}};db.query=async(sql)=>{reads++;assert.ok(sql.includes('is_demo=false'));return [{slug:'verified-clinician',updated_at:new Date().toISOString()}]}
  assert.deepEqual(await sitemap.generateSitemaps(),[{id:0},{id:1}]);assert.ok((await sitemap.default({id:Promise.resolve('1')}))[0].url.includes('/doctor/verified-clinician'));assert.equal(reads,2)
 }finally{for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env)}
})

test('Neon connections keep full TLS verification and allow a bounded cold-start connection window',async()=>{
 let config;class Pool{constructor(options){config=options}on(){}async end(){}}
 const adapter=loadServices(null,{pg:{Pool,types:{setTypeParser(){}}}})('lib/db/adapters.ts')
 const db=await adapter.createDatabase('postgresql://fixture:fixture@ep-test.neon.tech/carenest?sslmode=require&uselibpqcompat=true')
 assert.equal(new URL(config.connectionString).searchParams.get('sslmode'),'verify-full');assert.equal(new URL(config.connectionString).searchParams.has('uselibpqcompat'),false);assert.equal(config.connectionTimeoutMillis,10000);assert.equal(config.statement_timeout,5000);await db.close()
})
