import {loadEnvConfig} from '@next/env'
import {randomUUID,createHash} from 'node:crypto'
import {privateKey} from '../lib/secrets'
loadEnvConfig(process.cwd(),process.env.NODE_ENV==='development');process.env.CARENEST_LOCAL_MODE='1'
const port=Number(process.env.LOCAL_APP_PORT??3000),url=`http://127.0.0.1:${port}/api/internal/worker`
let running=false,failures=0
async function tick(){if(running)return;running=true;try{const nonce=randomUUID(),timestamp=String(Date.now()),body='{}',digest=createHash('sha256').update(body).digest('hex'),signature=privateKey('worker',`POST:/api/internal/worker:${timestamp}:${nonce}:${digest}`);const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-worker-time':timestamp,'x-worker-nonce':nonce,'x-worker-signature':signature},body,signal:AbortSignal.timeout(55000)});if(!response.ok)throw new Error('Worker endpoint not ready');const result=await response.json() as {claimed:number;failed:number};if(result.claimed)console.log(`Local worker processed ${result.claimed} events; ${result.failed} need retry/review.`);failures=0}catch{failures++;if(failures===1||failures%12===0)console.log('Local worker waiting for the app or an operation to recover.')}finally{running=false}}
void tick()
if(!process.argv.includes('--once')){const timer=setInterval(()=>void tick(),5000);process.on('SIGINT',()=>{clearInterval(timer);process.exit(0)});process.on('SIGTERM',()=>{clearInterval(timer);process.exit(0)})}
