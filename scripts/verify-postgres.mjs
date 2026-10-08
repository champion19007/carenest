import {execFile,spawn} from 'node:child_process'
import {promisify} from 'node:util'
import {randomBytes,randomUUID} from 'node:crypto'
import net from 'node:net'
import assert from 'node:assert/strict'
import {createDatabase} from '../lib/db/adapters.ts'
import {applyMigrations} from '../lib/db/migrations.ts'
import {loadServices} from '../tests/service-loader.mjs'
import {addUser,addDoctor} from '../tests/helpers.mjs'
const exec=promisify(execFile),name='carenest-check-'+randomUUID(),password=randomBytes(32).toString('hex')
const docker=async args=>(await exec('docker',args,{timeout:30000,maxBuffer:100000})).stdout.trim()
let created=false,db,restored,stage='local Docker readiness'
try{
 const context=await docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']);if(!/^(npipe:|unix:)/.test(context))throw new Error('A local Docker daemon is required')
 await docker(['info','--format','{{.ServerVersion}}'])
 // Pull can take longer, but it is a local image download, never cloud provisioning.
 await exec('docker',['pull','postgres:17'],{timeout:300000,maxBuffer:100000})
 stage='test container startup'
 const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve))
 await docker(['run','--detach','--name',name,'--memory','512m','--cpus','1','--publish',`127.0.0.1:${port}:5432`,'--env','POSTGRES_DB=carenest_check','--env','POSTGRES_USER=carenest','--env','POSTGRES_PASSWORD='+password,'postgres:17']);created=true
 let ready=false;for(let n=0;n<40;n++){try{await docker(['exec',name,'pg_isready','-U','carenest','-d','carenest_check']);ready=true;break}catch{await new Promise(resolve=>setTimeout(resolve,500))}}if(!ready)throw new Error('The local test database did not become ready')
 db=await createDatabase(`postgresql://carenest:${password}@127.0.0.1:${port}/carenest_check`);await applyMigrations(db)
 stage='real connection and reservation checks'
 process.env.CARENEST_LOCAL_MODE='1';process.env.DATA_ENCRYPTION_KEY='1'.repeat(64);process.env.AUTH_SECRET='synthetic-local-postgres-check-'.repeat(3)
 const connections=await Promise.all(Array.from({length:4},()=>db.transaction(tx=>tx.one('SELECT pg_backend_pid() pid,pg_sleep(0.1)'))));assert.ok(new Set(connections.map(r=>r.pid)).size>1)
 await db.query("INSERT INTO clinic.clinics(id,name) VALUES('clinic','Synthetic test clinic')");await addUser(db,'doctor','9000000001','doctor');await db.query("UPDATE patient.users SET kyc_level='verified' WHERE id='doctor'");await addDoctor(db,'provider');await db.query("UPDATE provider.doctors SET user_id='doctor',clinic_id='clinic',verified_at=now() WHERE id='provider'");await db.query("INSERT INTO provider.appointment_slots(slot_id,doctor_id,slot_start,slot_end) VALUES('slot','provider',now()+interval '1 hour',now()+interval '2 hours')")
 for(let n=0;n<20;n++)await addUser(db,'patient-'+n,'900000'+String(n+1000))
 const bookings=loadServices(db)('lib/domain/bookings.ts'),start=Date.now(),results=await Promise.allSettled(Array.from({length:20},(_,n)=>bookings.requestAppointment({actorId:'patient-'+n,doctorId:'provider',slotId:'slot',mode:'clinic',idempotencyKey:'postgres-contention-intent-'+n,consent:true})))
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(Number((await db.one('SELECT count(*) n FROM patient.bookings')).n),1);assert.ok((await db.one("SELECT reserved_booking_id FROM provider.appointment_slots WHERE slot_id='slot'")).reserved_booking_id)
 const archive=(await exec('docker',['exec',name,'pg_dump','-U','carenest','-d','carenest_check','--format=custom'],{encoding:'buffer',timeout:30000,maxBuffer:5000000})).stdout;assert.ok(archive.length>100)
 stage='dump restoration'
 await docker(['exec',name,'createdb','-U','carenest','carenest_restore'])
 await new Promise((resolve,reject)=>{const child=spawn('docker',['exec','--interactive',name,'pg_restore','-U','carenest','-d','carenest_restore','--exit-on-error'],{stdio:['pipe','ignore','pipe']});let diagnostic='';const timer=setTimeout(()=>{child.kill();reject(new Error('Restore timed out'))},30000);child.stderr.on('data',b=>{diagnostic=(diagnostic+b.toString()).slice(0,1000)});child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('Restore failed: '+diagnostic))});child.stdin.end(archive)})
 restored=await createDatabase(`postgresql://carenest:${password}@127.0.0.1:${port}/carenest_restore`);assert.equal(Number((await restored.one('SELECT count(*) n FROM patient.bookings')).n),1);await restored.close();restored=undefined
 stage='database restart recovery';await db.close();db=undefined;await docker(['restart',name]);let restarted=false;for(let n=0;n<40;n++){try{await docker(['exec',name,'pg_isready','-U','carenest','-d','carenest_check']);restarted=true;break}catch{await new Promise(resolve=>setTimeout(resolve,500))}}assert.ok(restarted);db=await createDatabase(`postgresql://carenest:${password}@127.0.0.1:${port}/carenest_check`);assert.equal(Number((await db.one('SELECT count(*) n FROM patient.bookings')).n),1)
 console.log(JSON.stringify({passed:true,connections:new Set(connections.map(r=>r.pid)).size,contenders:20,successfulReservations:1,contentionAndRecoveryMs:Date.now()-start,dumpBytes:archive.length,restoreVerified:true,restartRecoveryVerified:true,scope:'synthetic local test; not production capacity or HA proof'}))
}catch(error){console.error('Local PostgreSQL verification failed at '+stage+'. '+String(error.message??error.code??'').replaceAll(password,'[redacted]').slice(0,1000));process.exitCode=1}
finally{await restored?.close?.();await db?.close?.();if(created)await docker(['rm','--force','--volumes',name]).catch(()=>console.error('Remove the temporary test container '+name+' after checking its state'))}
