import {readFile,writeFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {RoomServiceClient,AccessToken,TrackSource as TokenTrackSource} from 'livekit-server-sdk'
import {Room,RoomEvent,dispose} from '@livekit/rtc-node'
const credentials=JSON.parse(await readFile('.data/infrastructure/livekit/credentials.json','utf8'))
const api=new RoomServiceClient('http://127.0.0.1:7880',credentials.key,credentials.secret,{requestTimeout:8}),name='verify_'+randomUUID(),a=new Room(),b=new Room()
const report={date:new Date().toISOString(),hosting:'local',roomCreated:false,twoParticipants:false,deletedRoomDisconnected:false,realCameraMicrophoneTest:false}
async function token(identity){const t=new AccessToken(credentials.key,credentials.secret,{identity,ttl:30});t.addGrant({roomJoin:true,room:name,canPublish:true,canSubscribe:true,canPublishData:false,canPublishSources:[TokenTrackSource.CAMERA,TokenTrackSource.MICROPHONE]});return t.toJwt()}
try{
 await api.createRoom({name,maxParticipants:2,emptyTimeout:60});report.roomCreated=true
 await a.connect('ws://127.0.0.1:7880',await token('synthetic-patient'),{autoSubscribe:true});await b.connect('ws://127.0.0.1:7880',await token('synthetic-clinician'),{autoSubscribe:true})
 report.twoParticipants=(await api.listParticipants(name)).length===2
 const disconnected=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Deletion did not disconnect the participant')),10000);a.once(RoomEvent.Disconnected,()=>{clearTimeout(timeout);resolve()})})
 await api.deleteRoom(name);await disconnected;report.deletedRoomDisconnected=true
 if(!report.twoParticipants)throw new Error('Expected two synthetic participants')
 await writeFile('docs/implementation/livekit-local-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report))
}finally{await a.disconnect().catch(()=>{});await b.disconnect().catch(()=>{});await api.deleteRoom(name).catch(()=>{});await dispose()}
