import test from 'node:test'
import assert from 'node:assert/strict'
import { freshDb, addUser } from './helpers.mjs'

/**
 * The audit log is the record shown to a regulator or a court. Its value comes
 * entirely from being untamperable, so that property is tested rather than
 * assumed.
 */

async function writeAudit(db, actor, action, resource) {
  await db.query(
    `INSERT INTO audit_log (actor_id, actor_role, action, resource, tenant_region, detail)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [actor, 'patient', action, resource, 'IN-MH', '{}'],
  )
}

test('audit rows can be written and read', async () => {
  const db = await freshDb()
  await addUser(db, 'u1', '+919000000001')
  await writeAudit(db, 'u1', 'record:read', 'u1')

  const rows = await db.query('SELECT * FROM audit_log')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].action, 'record:read')
  await db.close()
})

test('an audit row cannot be rewritten', async () => {
  const db = await freshDb()
  await addUser(db, 'u1', '+919000000001')
  await writeAudit(db, 'u1', 'record:read', 'u1')

  await assert.rejects(
    () => db.query(`UPDATE audit_log SET action = 'nothing happened'`),
    /append-only/,
  )

  const rows = await db.query('SELECT action FROM audit_log')
  assert.equal(rows[0].action, 'record:read')
  await db.close()
})

test('an audit row cannot be deleted', async () => {
  const db = await freshDb()
  await addUser(db, 'u1', '+919000000001')
  await writeAudit(db, 'u1', 'record:read', 'u1')

  await assert.rejects(() => db.query('DELETE FROM audit_log'), /append-only/)
  assert.equal((await db.query('SELECT 1 FROM audit_log')).length, 1)
  await db.close()
})
