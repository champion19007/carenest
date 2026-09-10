import { NextResponse, type NextRequest } from 'next/server'
import { sweepExpiredHolds } from '@/lib/db/slots'
import { drainAll } from '@/lib/drain'

export const dynamic = 'force-dynamic'

/**
 * Returns expired holds to the pool and drains the outbox.
 *
 * SCHEDULE: daily, and that is a platform limit rather than a preference.
 * Vercel's Hobby plan permits a cron job to fire only once per day, and it
 * rejects the whole deployment — before any build runs — if vercel.json asks
 * for more. An hourly schedule here failed the deploy outright.
 *
 * Neither job suffers much. `openSlots` already treats a hold past its TTL as
 * free, so the calendar self-heals with or without the sweep. And delivery
 * happens in `after()` on every path that emits, so this is the net that
 * catches a message whose invocation died, not the thing that sends it.
 *
 * If this ever moves to a paid plan, hourly is the better schedule — but
 * raising it here without raising the plan will break deployment, so leave it
 * alone until then.
 *
 * Not load-bearing for correctness: `openSlots` already treats a hold whose
 * TTL has passed as free, so a clinic's calendar never shrinks even if this
 * never runs. What it does is keep `status` honest for anything reading the
 * column directly — reports, the clinician calendar, a future analytics query
 * that would otherwise count abandoned requests as booked time.
 *
 * The secret check matters because the endpoint is a public URL. Vercel sends
 * `Authorization: Bearer $CRON_SECRET` when the variable is set; with no
 * secret configured the route refuses rather than defaulting to open, because
 * an unauthenticated endpoint that mutates every expired row is a free denial
 * of service against the clinic's calendar.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured; refusing to run.' },
      { status: 503 },
    )
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 })
  }

  const released = await sweepExpiredHolds()

  /* The durable half of delivery. after() gets most messages out within a
     second, but it dies with its invocation — this is what guarantees an
     event is eventually delivered even if that function was killed. */
  const drained = await drainAll(50)

  return NextResponse.json({ released, drained })
}
