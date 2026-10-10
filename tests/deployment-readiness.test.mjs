import test from 'node:test'
import assert from 'node:assert/strict'
import {deploymentIssue} from '../lib/runtime-config.ts'
import {loadServices} from './service-loader.mjs'

const complete={NODE_ENV:'production',VERCEL:'1',DATABASE_URL:'postgresql://fixture:fixture@db.example.test/carenest?sslmode=require',AUTH_SECRET:'a'.repeat(48),DATA_ENCRYPTION_KEY:'b'.repeat(64)}
test('hosted configuration does not confuse a local build with a usable Vercel runtime',()=>{
 assert.equal(deploymentIssue({NODE_ENV:'production',VERCEL:'1'}),'DATABASE_MISSING')
 assert.equal(deploymentIssue({...complete,DATABASE_URL:'   '}),'DATABASE_MISSING')
 assert.equal(deploymentIssue({...complete,DATABASE_URL:'sqlite:/tmp/demo.db'}),'DATABASE_INVALID')
 assert.equal(deploymentIssue({...complete,DATABASE_URL:'postgresql://db.example.test/'}),'DATABASE_INVALID')
 assert.equal(deploymentIssue({...complete,AUTH_SECRET:'short'}),'AUTH_SECRET_MISSING')
 assert.equal(deploymentIssue({...complete,AUTH_SECRET:undefined,JWT_SECRET:'a'.repeat(48)}),null)
 assert.equal(deploymentIssue({...complete,DATA_ENCRYPTION_KEY:'short'}),'ENCRYPTION_KEY_MISSING')
 assert.equal(deploymentIssue({...complete,CARENEST_LOCAL_MODE:'1'}),'LOCAL_MODE_ON_HOST')
 assert.equal(deploymentIssue(complete),null)
 assert.equal(deploymentIssue({NODE_ENV:'production',CARENEST_LOCAL_MODE:'1'}),null)
 assert.equal(deploymentIssue({NODE_ENV:'development'}),null)
})

test('missing hosted setup rewrites pages, refuses APIs/actions and keeps static help available',async()=>{
 const env={...process.env};for(const key of ['DATABASE_URL','AUTH_SECRET','JWT_SECRET','DATA_ENCRYPTION_KEY','CARENEST_LOCAL_MODE'])delete process.env[key];Object.assign(process.env,{VERCEL:'1',NODE_ENV:'production'})
 const response=(kind,url)=>({kind,url,headers:new Headers()})
 const load=loadServices({}, {'next/server':{NextResponse:{next:()=>response('next'),rewrite:url=>response('rewrite',String(url)),json:(body,options)=>({...response('json'),body,status:options?.status??200})}}}),{proxy}=load('proxy.ts')
 const request=(path,method='GET')=>({url:'https://carenest.example'+path,nextUrl:new URL('https://carenest.example'+path),method})
 try{
  for(const path of ['/','/search?area=400001','/pets','/sign-in','/account','/doctor/fixture']){
   const result=proxy(request(path));assert.equal(result.kind,'rewrite');assert.equal(result.url,'https://carenest.example/deployment-unavailable');assert.match(result.headers.get('Cache-Control'),/no-store/);assert.equal(result.headers.get('X-Robots-Tag'),'noindex, nofollow')
  }
  for(const path of ['/api/me','/api/auth/google','/api/payments/orders','/api/payments/verify']){
   const result=proxy(request(path));assert.equal(result.status,503);assert.equal(result.body.code,'SETUP_REQUIRED')
  }
  for(const path of ['/','/help','/help/privacy/how-we-use-data','/deployment-unavailable'])assert.equal(proxy(request(path,'POST')).status,503)
  for(const path of ['/deployment-unavailable','/api/health','/help','/help/privacy/how-we-use-data','/robots.txt','/sitemap.xml','/sitemap/0.xml','/icon.svg'])assert.equal(proxy(request(path)).kind,'next')
  assert.deepEqual(await load('app/robots.ts').default(),{rules:[{userAgent:'*',disallow:'/'}]})
  assert.deepEqual(await load('app/sitemap.ts').default({id:Promise.resolve('0')}),[])
  Object.assign(process.env,complete);assert.equal(proxy(request('/')).kind,'next');assert.equal(proxy(request('/account')).headers.get('Cache-Control'),'private, no-store')
 }finally{for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env)}
})

test('health checks refuse incomplete configuration before touching the database and report pending migrations privately',async()=>{
 const env={...process.env};for(const key of ['DATABASE_URL','AUTH_SECRET','JWT_SECRET','DATA_ENCRYPTION_KEY','CARENEST_LOCAL_MODE'])delete process.env[key];Object.assign(process.env,{VERCEL:'1',NODE_ENV:'production'})
 let calls=0,fail=false
 const load=loadServices({}, {'@/lib/db/client':{ensureSchema:async()=>{calls++;if(fail)throw new Error('Private database diagnostic')}},'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200,headers:options?.headers})}}}),{GET}=load('app/api/health/route.ts')
 try{
  let result=await GET();assert.equal(result.status,503);assert.equal(calls,0);assert.equal(result.body.code,'SETUP_REQUIRED')
  Object.assign(process.env,complete);result=await GET();assert.equal(result.status,200);assert.equal(result.body.status,'ready')
  fail=true;result=await GET();assert.equal(result.status,503);assert.equal(result.body.code,'DATABASE_NOT_READY');assert.equal(JSON.stringify(result).includes('Private database diagnostic'),false);assert.equal(result.headers['Cache-Control'],'no-store')
 }finally{for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env)}
})

test('Vercel cannot open an embedded database even when a local-mode flag was accidentally copied',async()=>{
 const env={...process.env},saved={db:globalThis.__carenestDb,promise:globalThis.__carenestDbPromise,ready:globalThis.__carenestDbReady};let opened=0
 Object.assign(process.env,{VERCEL:'1',CARENEST_LOCAL_MODE:'1',NODE_ENV:'production'});delete globalThis.__carenestDb;delete globalThis.__carenestDbPromise;delete globalThis.__carenestDbReady
 const load=loadServices({}, {'./adapters':{createDatabase:async()=>{opened++;throw new Error('Local filesystem must not be opened')}}}),client=load('lib/db/client.ts')
 try{await assert.rejects(client.getDb().one('SELECT 1'),/Embedded local storage cannot run on Vercel/);assert.equal(opened,0)}
 finally{globalThis.__carenestDb=saved.db;globalThis.__carenestDbPromise=saved.promise;globalThis.__carenestDbReady=saved.ready;for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env)}
})
