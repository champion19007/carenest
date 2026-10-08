import 'server-only'
import {AccessToken,RoomServiceClient,TrackSource} from 'livekit-server-sdk'
import {randomUUID} from 'node:crypto'
import {ensureSchema,getDb,type Db} from '@/lib/db/client'
import {localMode,privateKey} from '@/lib/secrets'
import {reject} from './errors'

export function livekitConfiguration(){
 const raw=process.env.LIVEKIT_URL,key=process.env.LIVEKIT_API_KEY,secret=process.env.LIVEKIT_API_SECRET
 if(!raw||!key||!secret||secret.length<32)reject('LIVEKIT_CONFIGURATION','The video service needs local setup before calls can start.',503)
 let url:URL;try{url=new URL(raw)}catch{reject('LIVEKIT_CONFIGURATION','Invalid video server address.',503)}
 if(url!.username||url!.password||url!.search||url!.hash||url!.pathname!=='/'||!['ws:','wss:'].includes(url!.protocol)||
 (localMode()?!['localhost','127.0.0.1','[::1]'].includes(url!.hostname):url!.protocol!=='wss:'))reject('LIVEKIT_CONFIGURATION','Local video must stay on loopback; hosted video requires secure WebSocket.',503)
 return {url:url!.origin,key,secret}
}
export function livekitConfigured(){try{livekitConfiguration();return true}catch{return false}}
function client(){const c=livekitConfiguration();return new RoomServiceClient(c.url.replace(/^ws/,'http'),c.key,c.secret,{requestTimeout:8})}
type Visit={id:string;revision:number;user_id:string;doctor_user:string;starts_at:string;ends_at:string}
async function eligible(db:Db,id:string,actorId?:string):Promise<Visit>{
 const b=await db.one<Visit>(`SELECT b.id,b.revision,b.user_id,d.user_id doctor_user,b.starts_at,b.ends_at FROM patient.bookings b
 JOIN provider.doctors d ON d.id=b.doctor_id JOIN patient.users host ON host.id=d.user_id JOIN patient.users patient ON patient.id=b.user_id
 LEFT JOIN clinic.clinics clinic ON clinic.id=d.clinic_id
 WHERE b.id=$1 AND b.status='confirmed' AND b.kind='video' AND host.status='ACTIVE' AND patient.status='ACTIVE'
 AND host.role='doctor' AND host.kyc_level='verified' AND d.status='ACTIVE' AND (d.verified_at IS NOT NULL OR ($2::boolean AND d.is_demo))
 AND (d.clinic_id IS NULL OR clinic.status='ACTIVE') AND ($3::text IS NULL OR b.user_id=$3 OR d.user_id=$3)
 AND EXISTS(SELECT 1 FROM patient.consents c WHERE c.booking_id=b.id AND c.actor_id=b.user_id AND c.purpose='video-provider' AND c.revoked_at IS NULL)`,[id,localMode(),actorId??null])
 if(!b)reject('UNAVAILABLE','The consultation or current participant consent is unavailable.',404)
 return b!
}
async function inWindow(db:Db,b:Visit){if(!(await db.one<{allowed:boolean}>("SELECT now() BETWEEN $1::timestamptz-interval '10 minutes' AND $2::timestamptz+interval '30 minutes' allowed",[b.starts_at,b.ends_at]))?.allowed)reject('WINDOW','Joining opens 10 minutes before the consultation and closes 30 minutes after it.',409)}
export async function provisionLivekit(id:string){
 await ensureSchema();livekitConfiguration();const b=await eligible(getDb(),id)
 await getDb().query("INSERT INTO video_sessions(id,booking_id,revision,provider,request_ref) VALUES($1,$2,$3,'livekit',$4) ON CONFLICT(booking_id,revision) DO NOTHING",['room_'+randomUUID(),id,b.revision,randomUUID()])
 const room=await getDb().one<{id:string;provider:string;state:string;external_id:string|null;request_ref:string}>('SELECT * FROM video_sessions WHERE booking_id=$1 AND revision=$2',[id,b.revision])
 if(!room||room.provider!=='livekit')reject('PROVIDER_CHANGED','An existing room uses another provider. Cancel and rebook to change it.',409)
 if(room!.state==='CANCELLED')reject('CLOSED','This video room has been closed.',409)
 // Deterministic opaque name makes retries safe after an uncertain create outcome.
 const name=room!.external_id??'cn_'+room!.request_ref.replaceAll('-','')
 await getDb().query("UPDATE video_sessions SET state='PROVISIONING',external_id=$2 WHERE id=$1 AND state IN ('PENDING','PROVISIONING')",[room!.id,name])
 await client().createRoom({name,maxParticipants:2,emptyTimeout:300,departureTimeout:30})
 try{const current=await eligible(getDb(),id);if(current.revision!==b.revision)reject('REVISION','The appointment changed.',409)
 const saved=await getDb().one("UPDATE video_sessions SET state='READY',error_code=NULL,updated_at=now() WHERE id=$1 AND state<>'CANCELLED' AND EXISTS(SELECT 1 FROM patient.bookings WHERE id=$2 AND revision=$3 AND status='confirmed') RETURNING id",[room!.id,id,b.revision]);if(!saved)reject('REVISION','The appointment changed.',409)
 }catch(e){await deleteRoom(name);await getDb().query("UPDATE video_sessions SET state='CANCELLED',updated_at=now() WHERE id=$1",[room!.id]);throw e}
}
async function deleteRoom(name:string){try{await client().deleteRoom(name)}catch(e){if((e as {code?:string}).code!=='not_found')throw e}}
export async function cancelLivekit(id:string,force=false){
 const b=await getDb().one<{revision:number;status:string}>('SELECT revision,status FROM patient.bookings WHERE id=$1',[id]);if(!b)return
 const rooms=await getDb().query<{id:string;external_id:string|null}>("UPDATE video_sessions SET state='CANCELLED',updated_at=now() WHERE booking_id=$1 AND provider='livekit' AND (revision<>$2 OR $3<>'confirmed' OR $4::boolean) RETURNING id,external_id",[id,b.revision,b.status,force])
 // Mark unavailable before network cleanup; a failed delete stays retryable.
 for(const room of rooms)if(room.external_id)await deleteRoom(room.external_id)
}
export async function livekitJoin(actorId:string,id:string){
 await ensureSchema();const c=livekitConfiguration(),b=await eligible(getDb(),id,actorId);await inWindow(getDb(),b)
 await provisionLivekit(id)
 return getDb().transaction(async tx=>{
  await tx.query('SELECT id FROM patient.bookings WHERE id=$1 FOR SHARE',[id]);const current=await eligible(tx,id,actorId);await inWindow(tx,current)
  const r=await tx.one<{external_id:string}>("SELECT external_id FROM video_sessions WHERE booking_id=$1 AND revision=$2 AND provider='livekit' AND state='READY' FOR SHARE",[id,current.revision]);if(!r?.external_id)reject('PENDING','The consultation room is not ready.',409)
  const identity=privateKey('livekit-participant',id+':'+current.revision+':'+actorId),role=actorId===current.doctor_user?'Clinician':'Patient / pet owner'
  const token=new AccessToken(c.key,c.secret,{identity,name:role,ttl:30})
  token.addGrant({roomJoin:true,room:r!.external_id,canPublish:true,canSubscribe:true,canPublishData:false,canUpdateOwnMetadata:false,canPublishSources:[TrackSource.CAMERA,TrackSource.MICROPHONE]})
  await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'livekit:join',$2)",[actorId,id])
  return {serverUrl:c.url,participantToken:await token.toJwt(),expiresIn:30}
 })
}
/** Best-effort active-session fence. Token expiry alone does not end a connected call. */
export async function reconcileLivekit(){
 if(!livekitConfigured())return {checked:0,closed:0,removed:0}
 const api=client(),rooms=await api.listRooms();let checked=0,closed=0,removed=0
 for(const r of rooms){if(!/^cn_[a-f0-9]{32}$/.test(r.name))continue;checked++
  const stored=await getDb().one<{booking_id:string;revision:number;state:string}>('SELECT booking_id,revision,state FROM video_sessions WHERE external_id=$1 AND provider=\'livekit\'',[r.name])
  let b:Visit|undefined
  let future=false
  try{if(!stored||!['READY','PROVISIONING'].includes(stored.state))reject('CLOSED','Closed',409);b=await eligible(getDb(),stored!.booking_id);if(b.revision!==stored!.revision)reject('REVISION','Changed',409);future=Boolean((await getDb().one<{future:boolean}>("SELECT now() < $1::timestamptz-interval '10 minutes' future",[b.starts_at]))?.future);await inWindow(getDb(),b)}catch{await deleteRoom(r.name);if(stored&&!future)await getDb().query("UPDATE video_sessions SET state='CANCELLED',updated_at=now() WHERE external_id=$1 AND provider='livekit'",[r.name]);closed++;continue}
  const allowed=new Set([b!.user_id,b!.doctor_user].map(id=>privateKey('livekit-participant',b!.id+':'+b!.revision+':'+id)))
  for(const participant of await api.listParticipants(r.name))if(!allowed.has(participant.identity)){await api.removeParticipant(r.name,participant.identity);removed++}
 }
 return {checked,closed,removed}
}
