import { NextResponse, type NextRequest } from 'next/server'
import { sweepExpiredHolds } from '@/lib/db/slots'

export const dynamic = 'force-dynamic'

/**
 * Returns expired holds to the pool.
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
  return NextResponse.json({ released })
}
