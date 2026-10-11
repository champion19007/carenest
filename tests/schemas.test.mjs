import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bookIntent,
  cancelIntent,
  mobileIntent,
  paymentSuccessWebhook,
  refundStatusWebhook,
  unknownWebhook,
} from '../lib/schemas.ts'

/**
 * Boundary parsers.
 *
 * The important property is not that zod validates — it is that replacing the
 * hand-written coercion did not change what the coercion produced. Mobile
 * intents are fingerprinted with `JSON.stringify([kind, canonical])`, so a
 * reordered key or a differently-coerced field would reject every booking a
 * phone retries after going offline, as if the details had changed.
 */

/** The coercion exactly as it was written before zod replaced it. */
function legacyCanonical(kind, p) {
  return kind === 'BOOK'
    ? {
        doctorId: String(p.doctorId ?? ''),
        slotId: String(p.slotId ?? ''),
        petId: typeof p.petId === 'string' ? p.petId : null,
        consent: p.consent === true,
      }
    : { bookingId: String(p.bookingId ?? ''), revision: Number(p.revision) }
}

const CASES = [
  ['BOOK', { doctorId: 'd1', slotId: 's1', petId: 'p1', consent: true }],
  ['BOOK', { doctorId: 'd1', slotId: 's1', consent: true }],
  ['BOOK', { doctorId: 'd1', slotId: 's1', petId: 42, consent: 'true' }],
  ['BOOK', { doctorId: 'd1', slotId: 's1', petId: null, consent: false }],
  ['BOOK', {}],
  ['CANCEL', { bookingId: 'b1', revision: 3 }],
  ['CANCEL', { bookingId: 'b1', revision: '3' }],
  ['CANCEL', { bookingId: 'b1' }],
  ['CANCEL', {}],
]

test('zod reproduces the previous canonical form byte for byte', () => {
  for (const [kind, payload] of CASES) {
    const before = JSON.stringify([kind, legacyCanonical(kind, payload)])
    const parsed = kind === 'BOOK' ? bookIntent.parse(payload) : cancelIntent.parse(payload)
    const after = JSON.stringify([kind, parsed])
    assert.equal(after, before, `${kind} ${JSON.stringify(payload)} changed its fingerprint`)
  }
})

test('consent is only true when it is literally true', () => {
  /* A string "true" from a hand-rolled client must not count as consent to
     treat a patient. */
  assert.equal(bookIntent.parse({ consent: 'true' }).consent, false)
  assert.equal(bookIntent.parse({ consent: 1 }).consent, false)
  assert.equal(bookIntent.parse({}).consent, false)
  assert.equal(bookIntent.parse({ consent: true }).consent, true)
})

test('a non-string pet id means no pet rather than a coerced one', () => {
  assert.equal(bookIntent.parse({ petId: 42 }).petId, null)
  assert.equal(bookIntent.parse({ petId: { id: 'p1' } }).petId, null)
  assert.equal(bookIntent.parse({ petId: 'p1' }).petId, 'p1')
})

test('a missing revision stays NaN for the caller to reject', () => {
  /* Not a parse error: the caller returns a REVISION message the mobile client
     already knows how to show. */
  assert.ok(Number.isNaN(cancelIntent.parse({}).revision))
  assert.equal(cancelIntent.parse({ revision: '7' }).revision, 7)
})

test('only the two supported intent kinds are accepted', () => {
  assert.equal(mobileIntent.safeParse({ kind: 'BOOK', payload: {} }).success, true)
  assert.equal(mobileIntent.safeParse({ kind: 'DELETE', payload: {} }).success, false)
  assert.equal(mobileIntent.safeParse({ kind: 'BOOK', payload: [] }).success, false)
  assert.equal(mobileIntent.safeParse({ kind: 'BOOK' }).success, false)
  assert.equal(mobileIntent.safeParse({}).success, false)
})

/* ── webhooks ────────────────────────────────────────────────────────── */

const PAYMENT = {
  type: 'PAYMENT_SUCCESS_WEBHOOK',
  data: {
    order: { order_id: 'order_abc123', order_amount: 600, order_currency: 'INR' },
    payment: {
      cf_payment_id: 998877,
      payment_status: 'SUCCESS',
      payment_amount: 600,
      payment_currency: 'INR',
    },
  },
}

test('a well-formed payment event parses', () => {
  const parsed = paymentSuccessWebhook.parse(PAYMENT)
  assert.equal(parsed.data.order.order_id, 'order_abc123')
  /* Numeric ids arrive as numbers and are normalised to strings. */
  assert.equal(parsed.data.payment.cf_payment_id, '998877')
})

test('a payment that is not SUCCESS is refused', () => {
  const pending = structuredClone(PAYMENT)
  pending.data.payment.payment_status = 'PENDING'
  assert.equal(paymentSuccessWebhook.safeParse(pending).success, false)
})

test('a malformed order id is refused', () => {
  for (const bad of ['', 'ab', 'order/../../etc', 'x'.repeat(60)]) {
    const event = structuredClone(PAYMENT)
    event.data.order.order_id = bad
    assert.equal(
      paymentSuccessWebhook.safeParse(event).success,
      false,
      `order id ${JSON.stringify(bad)} should be refused`,
    )
  }
})

test('missing nested payment fields are refused rather than read as undefined', () => {
  assert.equal(paymentSuccessWebhook.safeParse({ type: 'PAYMENT_SUCCESS_WEBHOOK' }).success, false)
  assert.equal(
    paymentSuccessWebhook.safeParse({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: {} }).success,
    false,
  )
})

test('a refund id is accepted at either nesting depth', () => {
  const nested = refundStatusWebhook.parse({
    type: 'REFUND_STATUS_WEBHOOK',
    data: { refund: { refund_id: 'rfnd_1' } },
  })
  assert.equal(nested.data.refund?.refund_id, 'rfnd_1')

  const flat = refundStatusWebhook.parse({
    type: 'REFUND_STATUS_WEBHOOK',
    data: { refund_id: 'rfnd_2' },
  })
  assert.equal(flat.data.refund_id, 'rfnd_2')
})

test('an unknown event keeps only a bounded type string', () => {
  assert.equal(unknownWebhook.parse({ type: 'SOMETHING_NEW' }).type, 'SOMETHING_NEW')
  assert.equal(unknownWebhook.parse({}).type, 'UNKNOWN')
  assert.equal(unknownWebhook.parse({ type: 42 }).type, 'UNKNOWN')
  /* An over-long type must not reach the database column. */
  assert.equal(unknownWebhook.parse({ type: 'x'.repeat(500) }).type, 'UNKNOWN')
})
