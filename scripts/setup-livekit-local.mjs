import {randomBytes} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import path from 'node:path'
const run=(args)=>execFileSync('docker',args,{encoding:'utf8',timeout:180000,stdio:['ignore','pipe','pipe']})
const endpoint=JSON.parse(run(['context','inspect']))[0]?.Endpoints?.docker?.Host
if(!endpoint||! /^(npipe:|unix:)/.test(endpoint))throw new Error('Local Docker Desktop context required; remote deployment is disabled.')
const directory=path.resolve('.data/infrastructure/livekit'),name='carenest-local-livekit',config=path.join(directory,'livekit.yaml')
await mkdir(directory,{recursive:true})
let credentials;try{credentials=JSON.parse(await readFile(path.join(directory,'credentials.json'),'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;credentials={key:'cn'+randomBytes(12).toString('hex'),secret:randomBytes(32).toString('hex')};await writeFile(path.join(directory,'credentials.json'),JSON.stringify(credentials),{flag:'wx'})}
if(!/^cn[a-f0-9]{24}$/.test(credentials.key)||! /^[a-f0-9]{64}$/.test(credentials.secret))throw new Error('Invalid local LiveKit credentials; repair privately.')
await writeFile(config,`port: 7880\nbind_addresses: ["0.0.0.0"]\nrtc:\n  tcp_port: 7881\n  udp_port: 7882\n  node_ip: 127.0.0.1\n  use_external_ip: false\nkeys:\n  ${credentials.key}: ${credentials.secret}\nlogging:\n  level: warn\n`)
let env='';try{env=await readFile('.env.local','utf8')}catch(e){if(e.code!=='ENOENT')throw e}
for(const [key,value]of Object.entries({LIVEKIT_URL:'ws://127.0.0.1:7880',LIVEKIT_API_KEY:credentials.key,LIVEKIT_API_SECRET:credentials.secret})){env=env.split(/\r?\n/).filter(line=>!new RegExp('^'+key+'=').test(line)).join('\n');env+='\n'+key+'='+value+'\n'}
await writeFile('.env.local',env)
const exists=run(['ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}']).trim()
if(exists){const inspected=JSON.parse(run(['inspect',name]))[0];if(inspected.Config?.Labels?.['carenest.local-service']!=='livekit'||inspected.Config?.Image!=='livekit/livekit-server:v1.13.7'||!Object.values(inspected.HostConfig?.PortBindings??{}).flat().every(p=>p.HostIp==='127.0.0.1')||!inspected.Mounts?.some(m=>m.Destination==='/etc/livekit.yaml'&&m.RW===false&&path.normalize(m.Source).toLowerCase()===path.normalize(config).toLowerCase()))throw new Error('Existing container is not the managed loopback LiveKit service. Inspect it before continuing.');run(['start',name])}
else run(['run','-d','--name',name,'--label','carenest.local-service=livekit','--restart','unless-stopped','--memory','512m','--cpus','1','-p','127.0.0.1:7880:7880','-p','127.0.0.1:7881:7881','-p','127.0.0.1:7882:7882/udp','--mount',`type=bind,source=${config},target=/etc/livekit.yaml,readonly`,'livekit/livekit-server:v1.13.7','--config','/etc/livekit.yaml'])
const {RoomServiceClient}=await import('livekit-server-sdk'),api=new RoomServiceClient('http://127.0.0.1:7880',credentials.key,credentials.secret,{requestTimeout:2})
let ready=false;for(let i=0;i<15;i++){try{await api.listRooms();ready=true;break}catch{await new Promise(resolve=>setTimeout(resolve,1000))}}
if(!ready)throw new Error('LiveKit did not become ready; inspect local Docker logs without publishing private credentials.')
console.log('Local LiveKit ready on loopback. Private credentials saved; restart CareNest to load them. No cloud account or paid plan used.')
