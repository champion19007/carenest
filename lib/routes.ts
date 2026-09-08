/**
 * Where a person lands after signing in.
 *
 * A clinician wants their own request queue, not a search page for booking
 * other doctors — landing every role on the patient dashboard was the reason
 * a doctor could only ever see the patient side of the product.
 *
 * Deliberately not in `app/actions/auth.ts`: a 'use server' module may only
 * export async functions, because every export becomes a callable server
 * endpoint. This is a pure function and belongs where both the server actions
 * and the OAuth route can import it.
 */
export function destinationFor(role: string, next?: string) {
  /* An explicit destination wins — it means the person was already on their
     way somewhere. The `//` guard stops `//evil.example` being read by the
     browser as a protocol-relative URL to another origin. */
  if (next && next.startsWith('/') && !next.startsWith('//')) return next
  return role === 'doctor' ? '/practice/requests' : '/dashboard/patient'
}

/**
 * Where a signed-in person belongs, including when their sign-up is not
 * finished.
 *
 * An account with no name is a real state: the code was verified and the
 * session is live, but we still do not know who they are. Every entry point
 * has to agree that such a person goes to /welcome, otherwise the sign-in page
 * re-renders mid-flow, sees a valid session, and forwards them to a dashboard
 * that can only greet them as "there".
 */
export function destinationForUser(
  user: { role: string; name: string },
  next?: string,
) {
  if (!user.name) {
    const query = next ? `?next=${encodeURIComponent(next)}` : ''
    return `/welcome${query}`
  }
  return destinationFor(user.role, next)
}
