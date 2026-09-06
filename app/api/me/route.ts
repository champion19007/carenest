import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'

/**
 * Minimal session probe for the header, which is a client component and so
 * cannot call `currentUser()` itself.
 *
 * Returns only what the menu needs to render — never the session token, and
 * never anything that isn't already visible to the signed-in user.
 */
export async function GET() {
  const user = await currentUser()

  if (!user) {
    return NextResponse.json({ user: null }, { headers: { 'cache-control': 'no-store' } })
  }

  return NextResponse.json(
    { user: { name: user.name, phone: user.phone } },
    { headers: { 'cache-control': 'no-store' } },
  )
}
