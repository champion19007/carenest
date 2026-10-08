import 'server-only'
import {randomBytes,randomUUID,createHash} from 'node:crypto'
import {getDb,ensureSchema} from '@/lib/db/client'
import {privateKey,encryptSecret,decryptSecret,localMode} from '@/lib/secrets'
import {reject,DomainError} from './errors'
import {provisionLivekit,cancelLivekit} from './livekit'
export type VideoVendor='zoom'|'google'
type Tokens={access_token:string;refresh_token?:string;expires_in:number;scope?:string}
type Connection={id:string;user_id:string;provider:VideoVendor;encrypted_tokens:string;expires_at:string;refresh_lease:string|null}
type Booking={id:string;revision:number;status:string;kind:string;starts_at:string;ends_at:string;user_id:string;doctor_user:string;doctor_status:string;kyc_level:string;verified_at:string|null;is_demo:boolean}
function vendor(value:string):'google'{if(value!=='google')reject('PROVIDER','Only Google account connection is supported. In-app calls use LiveKit.',400);return value}
export function integrationConfigured(provider:VideoVendor){return provider==='google'&&Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET)}
function config(provider:VideoVendor){if(provider!=='google')reject('RETIRED','Zoom integration has been retired.',410);const id=process.env.GOOGLE_CLIENT_ID,secret=process.env.GOOGLE_CLIENT_SECRET;if(!id||!secret)reject('NOT_CONFIGURED','Configure Google before connecting it.',503);return {id,secret}}
export function integrationOrigin(requestOrigin?:string){const raw=process.env.APP_ORIGIN??(localMode()?requestOrigin??'http://localhost:3000':undefined);if(!raw)reject('ORIGIN','APP_ORIGIN must be configured.',503);const url=new URL(raw);if(url.username||url.password||(!localMode()&&url.protocol!=='https:')||(localMode()&&(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!['http:','https:'].includes(url.protocol))))reject('ORIGIN','Invalid application origin.',503);return url.origin}
async function providerIdentity(userId:string,allowInactive=false){
 const d=await getDb().one<{id:string;clinic_id:string|null;status:string;verified_at:string|null;is_demo:boolean;role:string;kyc_level:string;user_status:string}>(`SELECT d.*,u.role,u.kyc_level,u.status user_status FROM provider.doctors d JOIN patient.users u ON u.id=d.user_id WHERE d.user_id=$1`,[userId])
 if(!d||(!allowInactive&&(d.user_status!=='ACTIVE'||d.status!=='ACTIVE'||d.role!=='doctor'||d.kyc_level!=='verified'||(!d.verified_at&&!(d.is_demo&&localMode())))))reject('FORBIDDEN','Current provider access is required.',403)
 if(!allowInactive&&d.clinic_id&&await getDb().one("SELECT id FROM clinic.clinics WHERE id=$1 AND status<>'ACTIVE'",[d.clinic_id]))reject('FORBIDDEN','The clinician’s clinic is not currently active.',403)
 return d
}
async function api(url:string,init:RequestInit={}){
 let response:Response
 try{response=await fetch(url,{...init,signal:AbortSignal.timeout(10000),cache:'no-store'})}catch{throw new DomainError('VENDOR_UNKNOWN','The provider outcome is unknown and needs reconciliation.',503)}
 if(!response.ok)throw new DomainError('VENDOR_'+response.status,'The meeting provider rejected the request.',response.status===429?503:502)
 if(response.status===204)return {}
 const text=await response.text();if(text.length>1000000)throw new DomainError('VENDOR_RESPONSE','Provider response is too large.',502)
 return JSON.parse(text) as Record<string,unknown>
}
function tokenBody(raw:Record<string,unknown>,prior?:Tokens):Tokens{
 if(typeof raw.access_token!=='string'||raw.access_token.length>20000)reject('TOKEN','Invalid provider token response.',502)
 const expires=Number(raw.expires_in??3600);if(!Number.isFinite(expires)||expires<1||expires>86400)reject('TOKEN','Invalid provider token expiry.',502)
 return {access_token:raw.access_token,refresh_token:typeof raw.refresh_token==='string'?raw.refresh_token:prior?.refresh_token,expires_in:expires,scope:typeof raw.scope==='string'?raw.scope:prior?.scope}
}
export async function beginVideoConnection(userId:string,rawProvider:string,origin:string){
 const provider=vendor(rawProvider);await ensureSchema();await providerIdentity(userId);const c=config(provider),state=randomBytes(32).toString('base64url'),hash=privateKey('video-oauth',state),verifier=randomBytes(32).toString('base64url'),callback=integrationOrigin(origin)+`/api/integrations/${provider}/callback`
 await getDb().query('INSERT INTO oauth_intents(state_hash,user_id,provider,verifier,expires_at) VALUES($1,$2,$3,$4,now()+interval \'10 minutes\')',[hash,userId,provider,encryptSecret(JSON.stringify({verifier,callback}),'oauth:'+hash)])
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth')
 for(const[k,v]of Object.entries({client_id:c.id,response_type:'code',redirect_uri:callback,state}))url.searchParams.set(k,v)
 if(provider==='google'){url.searchParams.set('scope','openid email https://www.googleapis.com/auth/calendar.events');url.searchParams.set('access_type','offline');url.searchParams.set('prompt','consent');url.searchParams.set('code_challenge',createHash('sha256').update(verifier).digest('base64url'));url.searchParams.set('code_challenge_method','S256')}
 return url.toString()
}
export async function completeVideoConnection(userId:string,rawProvider:string,state:string,code:string){
 const provider=vendor(rawProvider);await ensureSchema();await providerIdentity(userId);const c=config(provider),hash=privateKey('video-oauth',state)
 const intent=await getDb().one<{verifier:string}>(`UPDATE oauth_intents SET consumed_at=now() WHERE state_hash=$1 AND user_id=$2 AND provider=$3 AND consumed_at IS NULL AND expires_at>now() RETURNING verifier`,[hash,userId,provider])
 if(!intent)reject('OAUTH_STATE','The connection request expired or does not belong to this session.',403)
 const saved=JSON.parse(decryptSecret(intent.verifier,'oauth:'+hash)) as {verifier:string;callback:string}
 const body=new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:saved.callback})
 const headers:Record<string,string>={'Content-Type':'application/x-www-form-urlencoded'}
 body.set('client_id',c.id);body.set('client_secret',c.secret);body.set('code_verifier',saved.verifier)
 const tokens=tokenBody(await api('https://oauth2.googleapis.com/token',{method:'POST',headers,body}))
 const identity=await api('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+tokens.access_token}})
 const account=String(identity.id??identity.sub??'')
 if(!account)reject('IDENTITY','Provider account identity was not returned.',502)
 await providerIdentity(userId)
 await getDb().transaction(async tx=>{
  const prior=await tx.one<{account_ref:string}>('SELECT account_ref FROM provider.connections WHERE user_id=$1 AND provider=$2 FOR UPDATE',[userId,provider])
  if(prior&&prior.account_ref!==account&&await tx.one("SELECT r.id FROM video_sessions r JOIN patient.bookings b ON b.id=r.booking_id JOIN provider.doctors d ON d.id=b.doctor_id WHERE d.user_id=$1 AND r.provider=$2 AND r.state<>'CANCELLED' LIMIT 1",[userId,provider]))reject('ACCOUNT_CHANGED','Clean up existing meeting rooms before connecting a different account.')
  await tx.query(`INSERT INTO provider.connections(id,user_id,provider,encrypted_tokens,account_ref,scopes,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,now()+($7||' seconds')::interval) ON CONFLICT(user_id,provider) DO UPDATE
   SET encrypted_tokens=$4,account_ref=$5,scopes=$6,expires_at=now()+($7||' seconds')::interval,revoked_at=NULL,refresh_lease=NULL,refresh_until=NULL,updated_at=now()`,
   ['connection_'+randomUUID(),userId,provider,encryptSecret(JSON.stringify(tokens),'connection:'+userId+':'+provider),account,tokens.scope??'',String(tokens.expires_in)])
  await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'video:connect',$2)",[userId,provider])
  await tx.query('UPDATE provider.doctors SET video=true WHERE user_id=$1',[userId])
 })
}
async function accessToken(userId:string,provider:VideoVendor,cleanup=false){
 if(provider==='zoom')reject('RETIRED','Zoom API integration has been retired.',410)
 await providerIdentity(userId,cleanup)
 const row=await getDb().one<Connection>('SELECT * FROM provider.connections WHERE user_id=$1 AND provider=$2 AND revoked_at IS NULL',[userId,provider])
 if(!row)reject('CONNECTION','The practitioner must connect this meeting account.',503)
 const context='connection:'+userId+':'+provider,tokens=JSON.parse(decryptSecret(row.encrypted_tokens,context)) as Tokens
 if(new Date(row.expires_at).getTime()>Date.now()+60000)return tokens.access_token
 const lease=randomUUID(),claimed=await getDb().one<Connection>(`UPDATE provider.connections SET refresh_lease=$3,refresh_until=now()+interval '60 seconds'
  WHERE id=$1 AND encrypted_tokens=$2 AND revoked_at IS NULL AND (refresh_until IS NULL OR refresh_until<now()) RETURNING *`,[row.id,row.encrypted_tokens,lease])
 if(!claimed)reject('REFRESH_BUSY','The account connection is refreshing. Retry shortly.',503)
 if(!tokens.refresh_token)reject('RECONNECT','Reconnect the meeting account.',503)
 const c=config(provider),body=new URLSearchParams({grant_type:'refresh_token',refresh_token:tokens.refresh_token}),headers:Record<string,string>={'Content-Type':'application/x-www-form-urlencoded'}
 body.set('client_id',c.id);body.set('client_secret',c.secret)
 const refreshed=tokenBody(await api('https://oauth2.googleapis.com/token',{method:'POST',headers,body}),tokens)
 const updated=await getDb().one(`UPDATE provider.connections SET encrypted_tokens=$3,expires_at=now()+($4||' seconds')::interval,refresh_lease=NULL,refresh_until=NULL,updated_at=now()
  WHERE id=$1 AND refresh_lease=$2 AND revoked_at IS NULL AND encrypted_tokens=$5 RETURNING id`,[row.id,lease,encryptSecret(JSON.stringify(refreshed),context),String(refreshed.expires_in),row.encrypted_tokens])
 if(!updated)reject('CONNECTION_CHANGED','The connection changed while refreshing. Retry.',503)
 return refreshed.access_token
}
async function booking(id:string){return getDb().one<Booking>(`SELECT b.*,d.user_id doctor_user,d.status doctor_status,d.verified_at,d.is_demo,u.kyc_level
 FROM patient.bookings b JOIN provider.doctors d ON d.id=b.doctor_id LEFT JOIN patient.users u ON u.id=d.user_id WHERE b.id=$1`,[id])}
function joinUrl(value:unknown,provider:VideoVendor){if(typeof value!=='string')reject('JOIN','The provider has not returned a join URL.',503);const url=new URL(value);if(url.protocol!=='https:'||(provider==='google'?url.hostname!=='meet.google.com':!(url.hostname==='zoom.us'||url.hostname.endsWith('.zoom.us'))))reject('JOIN','Invalid provider join URL.',502);return value}
type Room={id:string;booking_id:string;revision:number;provider:VideoVendor;state:string;external_id:string|null;request_ref:string;encrypted_join:string|null}
export async function provisionVideo(id:string){
 await ensureSchema();const b=await booking(id)
 if(!b||b.kind!=='video'||b.status!=='confirmed')return
 await providerIdentity(b.doctor_user)
 const existing=await getDb().one<{provider:string}>('SELECT provider FROM video_sessions WHERE booking_id=$1 AND revision=$2',[id,b.revision]),preference=await getDb().one<{video_provider:string}>('SELECT video_provider FROM provider.doctors WHERE user_id=$1',[b.doctor_user])
 if((existing?.provider??preference?.video_provider)==='livekit'){await provisionLivekit(id);return}
 if(existing?.provider==='zoom')reject('RETIRED','Zoom API integration has been retired. Rebook using LiveKit.',410)
 const connection=await getDb().one<{provider:VideoVendor}>("SELECT provider FROM provider.connections WHERE user_id=$1 AND provider='google' AND revoked_at IS NULL",[b.doctor_user])
 if(!connection)reject('CONNECTION','Connect a meeting account before providing video consultations.',503)
 await getDb().query('INSERT INTO video_sessions(id,booking_id,revision,provider,request_ref) VALUES($1,$2,$3,$4,$5) ON CONFLICT(booking_id,revision) DO NOTHING',['room_'+randomUUID(),id,b.revision,connection.provider,randomUUID()])
 const room=await getDb().one<Room>('SELECT * FROM video_sessions WHERE booking_id=$1 AND revision=$2',[id,b.revision])
 if(!room||room.state==='READY'||room.state==='CANCELLED')return
 const token=await accessToken(b.doctor_user,room.provider),headers={Authorization:'Bearer '+token,'Content-Type':'application/json'},topic='CareNest consultation '+room.request_ref
 let result:Record<string,unknown>={}
 if(room.provider==='google'){
  const external=room.external_id??'cn'+room.request_ref.replaceAll('-','')
  if(room.state==='PROVISIONING'||room.external_id){
   try{result=await api('https://www.googleapis.com/calendar/v3/calendars/primary/events/'+encodeURIComponent(external),{headers})}
   catch(error){if(!(error instanceof DomainError)||error.code!=='VENDOR_404')throw error;result={}}
  }else result={}
  if(!result.id){
   await getDb().query("UPDATE video_sessions SET state='PROVISIONING',external_id=$2 WHERE id=$1",[room.id,external])
   try{result=await api('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none',{method:'POST',headers,body:JSON.stringify({id:external,summary:topic,start:{dateTime:new Date(b.starts_at).toISOString(),timeZone:'Asia/Kolkata'},end:{dateTime:new Date(b.ends_at).toISOString(),timeZone:'Asia/Kolkata'},conferenceData:{createRequest:{requestId:room.request_ref,conferenceSolutionKey:{type:'hangoutsMeet'}}}})})}
   catch(error){if(error instanceof DomainError&&error.code==='VENDOR_409')result=await api('https://www.googleapis.com/calendar/v3/calendars/primary/events/'+external,{headers});else throw error}
  }
  const conference=result.conferenceData as {entryPoints?:{entryPointType:string;uri:string}[]}|undefined
  const url=typeof result.hangoutLink==='string'?result.hangoutLink:conference?.entryPoints?.find(e=>e.entryPointType==='video')?.uri
  if(!url)reject('CONFERENCE_PENDING','Google conference creation is pending. The worker will reconcile it.',503)
  result={id:external,join_url:joinUrl(url,'google'),start_url:joinUrl(url,'google')}
 }
 const patient=joinUrl(result.join_url,room.provider),host=joinUrl(result.start_url??result.join_url,room.provider)
 await getDb().query('UPDATE video_sessions SET external_id=$2,encrypted_join=$3 WHERE id=$1',[room.id,String(result.id),encryptSecret(JSON.stringify({patient,host}),'room:'+room.id)])
 const current=await booking(id)
 if(current?.status!=='confirmed'||current.revision!==room.revision){await cancelVideo(id);return}
 const saved=await getDb().one("UPDATE video_sessions SET state='READY',error_code=NULL,updated_at=now() WHERE id=$1 AND state<>'CANCELLED' AND EXISTS(SELECT 1 FROM patient.bookings WHERE id=$2 AND status='confirmed' AND revision=$3) RETURNING id",[room.id,id,room.revision])
 if(!saved)await cancelVideo(id)
}
export async function cancelVideo(id:string,force=false){
 await ensureSchema();const b=await booking(id);if(!b)return
 await cancelLivekit(id,force)
 const rooms=await getDb().query<Room>("SELECT * FROM video_sessions WHERE booking_id=$1 AND provider<>'livekit' AND (state<>'CANCELLED' OR external_id IS NOT NULL) AND (revision<>$2 OR $3<>'confirmed' OR $4::boolean)",[id,b.revision,b.status,force])
 for(const room of rooms){
  if(room.external_id){const token=await accessToken(b.doctor_user,room.provider,true),url='https://www.googleapis.com/calendar/v3/calendars/primary/events/'+encodeURIComponent(room.external_id)+'?sendUpdates=none';try{await api(url,{method:'DELETE',headers:{Authorization:'Bearer '+token}})}catch(error){if(!(error instanceof DomainError)||error.code!=='VENDOR_404')throw error}}
  else if(room.state==='PROVISIONING')reject('ROOM_UNKNOWN','An ambiguous meeting must be reconciled before cleanup.',503)
  await getDb().query("UPDATE video_sessions SET state='CANCELLED',external_id=NULL,encrypted_join=NULL,updated_at=now() WHERE id=$1",[room.id])
 }
}
export async function videoJoin(actorId:string,id:string){
 await ensureSchema();const b=await booking(id)
 if(!b||(b.user_id!==actorId&&b.doctor_user!==actorId))reject('NOT_FOUND','Consultation unavailable.',404)
 if(b.status!=='confirmed'||b.kind!=='video')reject('STATE','This consultation is not active.',409)
 if(!await getDb().one("SELECT id FROM patient.consents WHERE booking_id=$1 AND actor_id=$2 AND purpose='video-provider' AND revoked_at IS NULL",[id,b.user_id]))reject('CONSENT','Consent for the meeting provider is required.',403)
 await providerIdentity(b.doctor_user)
 const time=await getDb().one<{allowed:boolean}>("SELECT now() BETWEEN $1::timestamptz-interval '10 minutes' AND $2::timestamptz+interval '30 minutes' allowed",[b.starts_at,b.ends_at])
 if(!time?.allowed)reject('WINDOW','Joining opens 10 minutes before the consultation.',409)
 const room=await getDb().one<Room>("SELECT * FROM video_sessions WHERE booking_id=$1 AND revision=$2 AND state='READY'",[id,b.revision])
 if(room?.provider==='zoom')reject('RETIRED','Zoom API integration has been retired.',410)
 if(!room?.encrypted_join)reject('PENDING','The room is not ready. Contact the clinic or retry shortly.',409)
 if(!await getDb().one('SELECT id FROM provider.connections WHERE user_id=$1 AND provider=$2 AND revoked_at IS NULL',[b.doctor_user,room.provider]))reject('CONNECTION','The clinician’s meeting connection is unavailable.',409)
 const links=JSON.parse(decryptSecret(room.encrypted_join,'room:'+room.id)) as {patient:string;host:string}
 let target=actorId===b.doctor_user?links.host:links.patient
 await getDb().transaction(async tx=>{
  const current=await tx.one(`SELECT b.id FROM patient.bookings b JOIN provider.doctors d ON d.id=b.doctor_id JOIN patient.users host ON host.id=d.user_id
   JOIN patient.users actor ON actor.id=$3 JOIN video_sessions r ON r.booking_id=b.id AND r.revision=b.revision
   JOIN provider.connections conn ON conn.user_id=d.user_id AND conn.provider=r.provider LEFT JOIN clinic.clinics c ON c.id=d.clinic_id
   WHERE b.id=$1 AND b.revision=$2 AND b.status='confirmed' AND b.kind='video' AND (b.user_id=$3 OR d.user_id=$3) AND (NOT $6::boolean OR d.user_id=$3)
   AND actor.status='ACTIVE' AND host.status='ACTIVE' AND host.role='doctor' AND host.kyc_level='verified' AND d.status='ACTIVE'
   AND (d.verified_at IS NOT NULL OR ($4::boolean AND d.is_demo)) AND (d.clinic_id IS NULL OR c.status='ACTIVE')
   AND r.state='READY' AND r.provider=$5 AND conn.revoked_at IS NULL
   AND now() BETWEEN b.starts_at-interval '10 minutes' AND b.ends_at+interval '30 minutes'
   AND EXISTS(SELECT 1 FROM patient.consents consent WHERE consent.booking_id=b.id AND consent.actor_id=b.user_id AND consent.purpose='video-provider' AND consent.revoked_at IS NULL)
   FOR SHARE OF b,d,host,actor,r,conn`,[id,room.revision,actorId,localMode(),room.provider,actorId===b.doctor_user])
  if(!current)reject('STATE','This consultation changed while preparing the join link.',409)
  await tx.query("INSERT INTO audit_log(actor_id,action,resource) VALUES($1,'video:join',$2)",[actorId,id])
 })
 return joinUrl(target,room.provider)
}
