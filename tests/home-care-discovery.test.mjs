import test from 'node:test'
import assert from 'node:assert/strict'
import {freshDb,addUser,addDoctor} from './helpers.mjs'
import {loadServices} from './service-loader.mjs'
test('hosted home-visit search excludes sample clinicians while local demos remain available',async()=>{
 const previous=process.env.CARENEST_LOCAL_MODE,db=await freshDb(),sql=loadServices(db)('lib/db/sql.ts')
 try{
  await addUser(db,'home-doctor','9000000088','doctor');await db.query("UPDATE patient.users SET kyc_level='verified' WHERE id='home-doctor'")
  await addDoctor(db,'home-real',{home_visit:true});await addDoctor(db,'home-sample',{home_visit:true})
  await db.query("UPDATE provider.doctors SET user_id='home-doctor',verified_at=now() WHERE id='home-real'");await db.query("UPDATE provider.doctors SET is_demo=true WHERE id='home-sample'")
  await db.query('INSERT INTO provider.demo_catalogue_settings(id,enabled) VALUES(1,true) ON CONFLICT(id) DO UPDATE SET enabled=true')
  process.env.CARENEST_LOCAL_MODE='1';assert.equal((await sql.searchDoctors({homeVisit:true})).length,2)
  process.env.CARENEST_LOCAL_MODE='0';assert.deepEqual((await sql.searchDoctors({homeVisit:true})).map(d=>d.id),['home-real'])
  assert.equal((await sql.findDoctorBySlug('home-sample')).home_visit,false)
 }finally{if(previous===undefined)delete process.env.CARENEST_LOCAL_MODE;else process.env.CARENEST_LOCAL_MODE=previous;await db.close()}
})
