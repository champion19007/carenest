import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluate, assertAllowed, PolicyError } from '../lib/policy.ts'
import { scopeForRole } from '../lib/jwt.ts'

/**
 * Authorisation tests are written as "who must be refused", because a policy
 * bug that denies too much is a support ticket and a policy bug that allows
 * too much is a disclosure of someone's medical history.
 */

const subject = (over = {}) => {
  const role = over.role ?? 'patient'
  return {
    sub: 'u1',
    role,
    tenant_region: 'IN-MH',
    data_scope: over.data_scope ?? scopeForRole(role),
    kyc_level: over.kyc_level ?? 'verified',
    ...over,
  }
}

test('browsing needs no account', () => {
  assert.ok(evaluate(null, 'doctor:search').allow)
  assert.ok(evaluate(null, 'doctor:read').allow)
})

test('everything else requires authentication', () => {
  for (const action of ['booking:create', 'record:read', 'record:write', 'practice:access']) {
    assert.equal(evaluate(null, action).allow, false, action)
  }
})

test('a patient reads only their own records', () => {
  const me = subject()
  assert.ok(evaluate(me, 'record:read', { ownerId: 'u1' }).allow)
  assert.equal(evaluate(me, 'record:read', { ownerId: 'u2' }).allow, false)
})

test('a clinician reads only patients on their panel', () => {
  const doc = subject({ role: 'doctor' })
  assert.ok(evaluate(doc, 'record:read', { ownerId: 'p1', panel: ['p1', 'p2'] }).allow)
  assert.equal(evaluate(doc, 'record:read', { ownerId: 'p9', panel: ['p1'] }).allow, false)
  /* An absent panel must fail closed rather than be read as "no restriction". */
  assert.equal(evaluate(doc, 'record:read', { ownerId: 'p1' }).allow, false)
})

test('a pharmacy never reads a full record', () => {
  const rx = subject({ role: 'pharmacy' })
  assert.equal(evaluate(rx, 'record:read', { ownerId: 'u1' }).allow, false)
})

test('data residency is enforced across regions', () => {
  const me = subject()
  const d = evaluate(me, 'record:read', { ownerId: 'u1', tenantRegion: 'IN-KA' })
  assert.equal(d.allow, false)
  assert.match(d.reason, /cross-region/)
})

test('an unverified clinician cannot open the clinic app', () => {
  assert.equal(evaluate(subject({ role: 'doctor', kyc_level: 'pending' }), 'practice:access').allow, false)
  assert.ok(evaluate(subject({ role: 'doctor' }), 'practice:access').allow)
  assert.equal(evaluate(subject(), 'practice:access').allow, false)
})

test('only patients book and review', () => {
  assert.ok(evaluate(subject(), 'booking:create').allow)
  assert.equal(evaluate(subject({ role: 'doctor' }), 'booking:create').allow, false)
  assert.equal(evaluate(subject({ role: 'admin' }), 'review:write').allow, false)
})

test('an unknown action is denied, not ignored', () => {
  assert.equal(evaluate(subject(), 'something:invented').allow, false)
})

test('assertAllowed throws a PolicyError carrying the reason', () => {
  assert.throws(
    () => assertAllowed(subject(), 'record:read', { ownerId: 'someone-else' }),
    (err) => err instanceof PolicyError && /own records/.test(err.reason),
  )
})

test('scope is derived from role, never chosen', () => {
  assert.equal(scopeForRole('patient'), 'phi:self')
  assert.equal(scopeForRole('doctor'), 'phi:panel')
  assert.equal(scopeForRole('pharmacy'), 'rx:fulfilment')
  assert.equal(scopeForRole('admin'), 'phi:none')
})
