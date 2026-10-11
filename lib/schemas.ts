import {z} from 'zod'

/**
 * Parsers for input that arrives from outside the application.
 *
 * Only two boundaries use these: provider webhooks and the mobile sync queue.
 * Both take JSON shaped by someone else — a payment provider's event, or a
 * phone replaying an intent recorded while it was offline — and both previously
 * walked optional chains by hand (`body.data?.order?.order_id`) with a regex
 * per field. The checks were correct; they were just spread far enough apart
 * that adding a field meant remembering every place that reads it.
 *
 * Deliberately not applied to the rest of the app. Server actions take FormData
 * through their own validation and are already tested; converting them would be
 * a large diff for no behaviour change.
 */

/* ── mobile sync ─────────────────────────────────────────────────────── */

/**
 * Key order here is load-bearing and must not be rearranged.
 *
 * `syncMobileIntent` hashes `JSON.stringify([kind, canonical])` as the
 * idempotency fingerprint, and `JSON.stringify` emits keys in insertion order.
 * Zod returns them in schema order, so reordering these lines would change the
 * hash of every replayed intent — a phone retrying a booking it made while
 * offline would be rejected as "different details" rather than recognised.
 */
export const bookIntent = z.object({
  doctorId: z.string().default(''),
  slotId: z.string().default(''),
  /* A non-string pet id means "no pet", matching the previous typeof check —
     coercing it would silently book for the wrong animal. */
  petId: z.string().nullable().catch(null),
  /* Consent is only true when it is literally true. Anything else, including
     the string "true", is not consent. */
  consent: z.literal(true).catch(false as never).transform((value) => value === true),
})

export const cancelIntent = z.object({
  bookingId: z.string().default(''),
  /* NaN is preserved rather than rejected here: the caller checks
     Number.isInteger afterwards and returns a REVISION error, which is the
     message the mobile client already handles. */
  revision: z.coerce.number().catch(Number.NaN),
})

export const mobileIntent = z.object({
  kind: z.enum(['BOOK', 'CANCEL']),
  payload: z.looseObject({}),
})

/* ── Cashfree webhooks ───────────────────────────────────────────────── */

/** Provider ids: conservative, and the same shapes the hand-written checks used. */
const providerId = z.string().regex(/^[A-Za-z0-9_-]{3,45}$/)
const numericId = z.string().regex(/^\d{1,40}$/)

/**
 * Amounts arrive as a number from Cashfree and as a string from some replays.
 * Kept loose here on purpose — `cashfreeAmount` normalises to paise, and the
 * value is compared against the stored order either way.
 */
const amount = z.union([z.number(), z.string()])

export const paymentSuccessWebhook = z.object({
  type: z.literal('PAYMENT_SUCCESS_WEBHOOK'),
  data: z.object({
    order: z.object({
      order_id: providerId,
      order_amount: amount,
      order_currency: z.string(),
    }),
    payment: z.object({
      cf_payment_id: z.union([z.string(), z.number()]).transform(String).pipe(numericId),
      payment_status: z.literal('SUCCESS'),
      payment_amount: amount,
      payment_currency: z.string(),
    }),
  }),
})

export const refundStatusWebhook = z.object({
  type: z.literal('REFUND_STATUS_WEBHOOK'),
  data: z.object({
    /* Cashfree has sent the id at both depths across API versions, so accept
       either rather than failing a real refund on a nesting change. */
    refund: z.object({refund_id: providerId}).optional(),
    refund_id: providerId.optional(),
  }),
})

/** Anything else is recorded and ignored, so only the discriminator is read. */
export const unknownWebhook = z.object({
  type: z.string().max(100).catch('UNKNOWN'),
})
