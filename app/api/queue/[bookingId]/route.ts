import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { findBooking } from '@/lib/db/sql'
import { queueStatusFor } from '@/lib/db/queue'

export const dynamic = 'force-dynamic'

/**
 * Live queue position for one booking, polled by the patient's dashboard.
 *
 * Polling rather than a socket: Vercel functions cannot hold a WebSocket open,
 * and a queue that moves every few minutes does not need one. The client asks
 * every 30 seconds, which is well inside the free tier and still feels live
 * next to the alternative of standing in a waiting room.
 *
 * The ownership check is the whole security of this route. A booking id in a
 * URL is guessable enough that returning a queue position for any id would
 * disclose that a named person has an appointment with a named doctor at a
 * known time — which is health information, not metadata. So the booking must
 * belong to the caller, and a booking that does not is reported as missing
 * rather than forbidden: "403" on someone else's id confirms it exists.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params

  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const booking = await findBooking(bookingId)
  if (!booking || booking.user_id !== user.id) {
    return NextResponse.json({ error: 'No such appointment.' }, { status: 404 })
  }

  const status = await queueStatusFor(bookingId)
  if (!status) return NextResponse.json({ status: null })

  return NextResponse.json(
    { status },
    /* Never cached: a queue position one minute old is misinformation. */
    { headers: { 'cache-control': 'no-store' } },
  )
}
