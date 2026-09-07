import test from 'node:test'
import assert from 'node:assert/strict'
import { signClaims, verifyClaims } from '../lib/jwt.ts'

const claims = {
  sub: 'u1',
  role: 'doctor',
  tenant_region: 'IN-MH',
  data_scope: 'phi:panel',
  kyc_level: 'verified',
}

test('a signed token round-trips', async () => {
  const got = await verifyClaims(await signClaims(claims))
  assert.deepEqual(got, claims)
})

test('a tampered payload is rejected', async () => {
  const token = await signClaims({ ...claims, role: 'patient' })
  const [header, payload, signature] = token.split('.')
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString())
  decoded.role = 'admin'
  const forged = [
    header,
    Buffer.from(JSON.stringify(decoded)).toString('base64url'),
    signature,
  ].join('.')

  assert.equal(await verifyClaims(forged), null)
})

test('garbage is rejected rather than thrown', async () => {
  assert.equal(await verifyClaims('not-a-token'), null)
  assert.equal(await verifyClaims(''), null)
})

test('an expired token is rejected', async () => {
  const token = await signClaims(claims, -1)
  assert.equal(await verifyClaims(token), null)
})
