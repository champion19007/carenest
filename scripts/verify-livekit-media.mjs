import {readFile,writeFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {RoomServiceClient,AccessToken,TrackSource as GrantSource} from 'livekit-server-sdk'
import {Room,RoomEvent,AudioSource,AudioFrame,AudioStream,VideoSource,VideoFrame,VideoStream,VideoBufferType,LocalAudioTrack,LocalVideoTrack,TrackPublishOptions,TrackSource,TrackKind,VideoCodec,dispose} from '@livekit/rtc-node'

const credentials=JSON.parse(await readFile('.data/infrastructure/livekit/credentials.json','utf8'))
const api=new RoomServiceClient('http://127.0.0.1:7880',credentials.key,credentials.secret,{requestTimeout:8})
const name='verify_media_'+randomUUID(),patient=new Room(),doctor=new Room(),sources=[],reads=[]
const report={checkedAt:new Date().toISOString(),hosting:'local',roomCreated:false,participants:0,patientReceived:{audio:0,video:0},doctorReceived:{audio:0,video:0},syntheticBidirectionalMedia:false,roomRemoved:false,physicalCameraMicrophoneTest:false,recordingEnabled:false}
let sending=true
async function token(identity){const t=new AccessToken(credentials.key,credentials.secret,{identity,ttl:60});t.addGrant({roomJoin:true,room:name,canPublish:true,canSubscribe:true,canPublishData:false,canPublishSources:[GrantSource.CAMERA,GrantSource.MICROPHONE]});return t.toJwt()}
for(const [room,counts] of [[patient,report.patientReceived],[doctor,report.doctorReceived]])room.on(RoomEvent.TrackSubscribed,track=>{
 const kind=track.kind===TrackKind.KIND_AUDIO?'audio':'video',stream=kind==='audio'?new AudioStream(track):new VideoStream(track),reader=stream.getReader()
 reads.push((async()=>{try{while(counts[kind]<3){const frame=await reader.read();if(frame.done)break;counts[kind]++}}finally{await reader.cancel().catch(()=>{})}})())
})
async function publish(room){
 const audio=new AudioSource(48000,1),video=new VideoSource(160,120);sources.push(audio,video)
 await room.localParticipant.publishTrack(LocalAudioTrack.createAudioTrack('synthetic-microphone',audio),new TrackPublishOptions({source:TrackSource.SOURCE_MICROPHONE,dtx:false}))
 await room.localParticipant.publishTrack(LocalVideoTrack.createVideoTrack('synthetic-camera',video),new TrackPublishOptions({source:TrackSource.SOURCE_CAMERA,videoCodec:VideoCodec.VP8}))
 const pcm=new Int16Array(480);for(let i=0;i<pcm.length;i++)pcm[i]=Math.round(Math.sin(i/48000*440*Math.PI*2)*3000)
 const pixels=new Uint8Array(160*120*4);for(let i=0;i<pixels.length;i+=4){pixels[i]=40;pixels[i+1]=130;pixels[i+2]=220;pixels[i+3]=255}
 return (async()=>{for(let i=0;i<500&&sending;i++){await audio.captureFrame(new AudioFrame(pcm,48000,1,480));if(i%5===0)video.captureFrame(new VideoFrame(pixels,160,120,VideoBufferType.RGBA));await new Promise(resolve=>setTimeout(resolve,10))}})()
}
try{
 await api.createRoom({name,maxParticipants:2,emptyTimeout:60});report.roomCreated=true
 await patient.connect('ws://127.0.0.1:7880',await token('synthetic-patient'),{autoSubscribe:true});await doctor.connect('ws://127.0.0.1:7880',await token('synthetic-doctor'),{autoSubscribe:true})
 report.participants=(await api.listParticipants(name)).length
 const publishers=await Promise.all([publish(patient),publish(doctor)])
 await Promise.all(publishers);await new Promise(resolve=>setTimeout(resolve,1000))
 report.syntheticBidirectionalMedia=Object.values(report.patientReceived).every(n=>n>=3)&&Object.values(report.doctorReceived).every(n=>n>=3)
 await api.deleteRoom(name);report.roomRemoved=true
 await writeFile('docs/implementation/livekit-media-verification-2026-10-10.json',JSON.stringify(report,null,2))
 console.log(JSON.stringify(report))
 if(!report.syntheticBidirectionalMedia)process.exitCode=1
}finally{
 sending=false;await patient.disconnect().catch(()=>{});await doctor.disconnect().catch(()=>{})
 await api.deleteRoom(name).catch(()=>{});for(const source of sources)await source.close().catch(()=>{});await dispose()
}
