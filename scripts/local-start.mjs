import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import {assertLocalStopped} from './local-lock.mjs'
const require = createRequire(import.meta.url)
const args=process.argv.slice(2),dev=args.includes('--dev')
require('@next/env').loadEnvConfig(process.cwd(),dev)
const portIndex=args.findIndex(arg=>arg==='--port'||arg==='-p')
const port=Number(portIndex>=0?args[portIndex+1]:process.env.PORT??3000)
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Choose a local port between 1024 and 65535')
if(args.some(arg=>arg.startsWith('--hostname')||arg.startsWith('-H')))throw new Error('Local startup binds to 127.0.0.1')
const env={...process.env,NODE_ENV:dev?'development':'production',CARENEST_LOCAL_MODE:'1',SMS_PROVIDER:process.env.SMS_PROVIDER??'disabled',ALLOW_LOCAL_OTP:process.env.ALLOW_LOCAL_OTP??'0',LOCAL_APP_PORT:String(port),CARENEST_LOCAL_OWNER:String(process.pid)}
const marker=path.resolve('.data/local-process.json')
await mkdir(path.dirname(marker),{recursive:true})
await assertLocalStopped()
await writeFile(marker,JSON.stringify({pid:process.pid,port}),{flag:'wx'})
const children=new Set()
function launch(commandArgs){const child=spawn(process.execPath,commandArgs,{stdio:'inherit',env});children.add(child);child.once('exit',()=>children.delete(child));return child}
function completed(child){return new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`Local command exited ${code}`)))})}
let stopping=false
async function stop(){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');await Promise.all([...children].map(child=>new Promise(resolve=>child.once('exit',resolve))));await unlink(marker).catch(()=>{})}
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop())
try{
 await completed(launch([require.resolve('tsx/cli'),'scripts/migrate.ts','--local']))
 const app=launch([require.resolve('next/dist/bin/next'),dev?'dev':'start','--hostname','127.0.0.1',...args.filter(arg=>arg!=='--dev'),...(portIndex<0?['--port',String(port)]:[])])
 launch([require.resolve('tsx/cli'),'scripts/worker.ts'])
 await completed(app)
}finally{await stop()}
