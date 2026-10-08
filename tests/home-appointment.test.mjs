import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { freshDb, addDoctor, addUser } from './helpers.mjs'

test('home appointment uses the earliest future visit for the current account', async () => {
  const db = await freshDb()
  try {
    await addUser(db, 'home-a', '9000000001')
    await addUser(db, 'home-b', '9000000002')
    await addDoctor(db, 'home-doctor')
    const fixture = async (id, user, minutes, status, createdAgo = 0) => {
      await db.query(`INSERT INTO provider.appointment_slots (slot_id, doctor_id, slot_start, slot_end)
        VALUES ($1, 'home-doctor', now() + ($2 || ' minutes')::interval, now() + (($2::int + 15) || ' minutes')::interval)`, [id, String(minutes)])
      await db.query(`INSERT INTO patient.bookings (id,user_id,doctor_id,slot_id,kind,slot,status,created_at)
        VALUES ($1,$2,'home-doctor',$1,'clinic','Today, 9:00 AM',$3,now() - ($4 || ' days')::interval)`, [id,user,status,String(createdAgo)])
    }
    await fixture('past', 'home-a', -60, 'confirmed')
    await fixture('other-account', 'home-b', 15, 'confirmed')
    await fixture('declined', 'home-a', 25, 'declined')
    await fixture('cancelled', 'home-a', 30, 'cancelled')
    await fixture('later-newer', 'home-a', 240, 'confirmed')
    await fixture('earliest-older', 'home-a', 60, 'requested', 5)
    // Load the actual service. Only its framework and DB boundary are replaced.
    const module = { exports: {} }
    const source = ts.transpileModule(readFileSync('lib/db/home.ts','utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const context = vm.createContext({ module, exports: module.exports, require(name) {
      if (name === 'server-only') return {}
      if (name === './client') return { ensureSchema: async () => {}, getDb: () => db }
      throw new Error(`Unexpected import ${name}`)
    } })
    new vm.Script(source, { filename: 'lib/db/home.ts' }).runInContext(context)
    const find = module.exports.nextHomeAppointment
    const result = await find('home-a')
    assert.equal(result.id, 'earliest-older')
    assert.equal(result.status, 'requested')
    assert.equal(result.doctor_name, 'Dr home-doctor')
    assert.ok(new Date(result.starts_at).getTime() > Date.now())
    assert.equal((await find('home-b')).id, 'other-account')
    assert.equal(await find('absent-user'), undefined)
  } finally { await db.close() }
})
