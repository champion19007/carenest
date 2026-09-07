import 'server-only'
import { currentClaims } from './auth'
import { assertAllowed, type Action, type Resource } from './policy'
import { writeAudit } from './db/sql'
import type { Claims } from './jwt'

/**
 * The single door through which patient data is read or written.
 *
 * Three things must happen together, in this order, every time:
 *
 *   1. the policy is asked, and a denial stops the request;
 *   2. the data is loaded;
 *   3. the access is recorded in the append-only audit log.
 *
 * Scattering these three steps across pages guarantees that one of them is
 * eventually forgotten in a hurry. Routing every access through one function
 * means a reviewer can ask "what touches PHI?" and get a complete answer by
 * looking at the callers of `accessPhi`.
 */

export class AuditUnavailableError extends Error {
  constructor(readonly action: Action) {
    super(`Refusing to serve ${action}: the access could not be recorded`)
    this.name = 'AuditUnavailableError'
  }
}

export async function accessPhi<T>(
  action: Action,
  resource: Resource,
  load: (subject: Claims) => Promise<T>,
): Promise<T> {
  const subject = await currentClaims()

  /* Denials are audited too — an attempt to reach someone else's record is
     precisely the event an investigator will come looking for. */
  try {
    assertAllowed(subject, action, resource)
  } catch (denial) {
    await recordAccess(subject, action, resource, 'denied')
    throw denial
  }

  const result = await load(subject as Claims)
  await recordAccess(subject as Claims, action, resource, 'allowed')
  return result
}

async function recordAccess(
  subject: Claims | null,
  action: Action,
  resource: Resource,
  outcome: 'allowed' | 'denied',
) {
  try {
    await writeAudit({
      actorId: subject?.sub ?? null,
      actorRole: subject?.role ?? null,
      action,
      resource: resource.ownerId ?? null,
      tenantRegion: subject?.tenant_region ?? null,
      detail: { outcome },
    })
  } catch (cause) {
    // TODO(human): decide what happens when the audit write itself fails.
  }
}
