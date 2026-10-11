import {z} from 'zod'

/**
 * Parsers for JSON arriving from outside: provider webhooks and mobile sync.
 * Server actions keep their own FormData validation.
 */

/* mobile sync */

/**
 * Field order is the idempotency fingerprint: syncMobileIntent hashes
 * JSON.stringify([kind, canonical]). Reorder these and every replay breaks.
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

/* Cashfree webhooks */

/** Provider ids: conservative, and the same shapes the hand-written checks used. */
const providerId = z.string().regex(/^[A-Za-z0-9_-]{3,45}$/)
const numericId = z.string().regex(/^\d{1,40}$/)

/** Number or string across Cashfree replays; cashfreeAmount normalises to paise. */
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

