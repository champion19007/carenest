import type { Claims } from './jwt'

/**
 * Authorisation policy.
 *
 * Stands in for the OPA/Rego sidecar in the target architecture. The shape is
 * deliberately the same — a pure function of (subject, action, resource) that
 * runs *before* business logic and returns an explicit allow or deny with a
 * reason — so replacing this with a real OPA call later is a change of
 * transport, not of design.
 *
 * Deny by default. A rule must actively permit an action; anything not
 * matched is refused.
 */

export type Action =
  | 'doctor:read' // public profile
  | 'doctor:search'
  | 'booking:create'
  | 'booking:read'
  | 'record:read' // prescriptions, chart notes
  | 'record:write'
  | 'review:write'
  | 'practice:access' // the clinic app
  | 'admin:access'

export type Resource = {
  /** Who the data belongs to, when it belongs to someone. */
  ownerId?: string
  /** For clinician access: patients this doctor has actually seen. */
  panel?: string[]
  tenantRegion?: string
}

export type Decision = { allow: boolean; reason: string }

const allow = (reason: string): Decision => ({ allow: true, reason })
const deny = (reason: string): Decision => ({ allow: false, reason })

/** Anything readable without an account. */
const PUBLIC_ACTIONS: Action[] = ['doctor:read', 'doctor:search']

/**
 * @param subject null when nobody is signed in.
 */
export function evaluate(
  subject: Claims | null,
  action: Action,
  resource: Resource = {},
): Decision {
  /* Browsing is public — that is what makes the site indexable. */
  if (PUBLIC_ACTIONS.includes(action)) return allow('public action')

  if (!subject) return deny('authentication required')

  /* Data residency: a subject bound to one region must not read another's.
     With a single free-tier database this cannot be enforced by routing to a
     separate cluster, so it is enforced here instead. */
  if (resource.tenantRegion && resource.tenantRegion !== subject.tenant_region) {
    return deny(`cross-region access denied (${subject.tenant_region} → ${resource.tenantRegion})`)
  }

  switch (action) {
    case 'booking:create':
      if (subject.role !== 'patient') return deny('only patients can book')
      return allow('patient booking for themselves')

    case 'booking:read':
    case 'record:read': {
      if (subject.data_scope === 'phi:self') {
        return resource.ownerId === subject.sub
          ? allow('own records')
          : deny('phi:self is limited to the subject’s own records')
      }
      if (subject.data_scope === 'phi:panel') {
        if (!resource.ownerId) return deny('no record owner supplied')
        return resource.panel?.includes(resource.ownerId)
          ? allow('patient is on this clinician’s panel')
          : deny('patient is not on this clinician’s panel')
      }
      if (subject.data_scope === 'rx:fulfilment') {
        /* A pharmacy sees dispensing fields through a dedicated projection,
           never the full record. */
        return deny('pharmacy scope cannot read full records')
      }
      return deny('scope does not permit reading PHI')
    }

    case 'record:write':
      if (subject.role !== 'doctor') return deny('only clinicians can write to a chart')
      if (!resource.ownerId) return deny('no patient supplied')
      return resource.panel?.includes(resource.ownerId)
        ? allow('writing to a chart on this clinician’s panel')
        : deny('patient is not on this clinician’s panel')

    case 'review:write':
      if (subject.role !== 'patient') return deny('only patients can review')
      return allow('patient review')

    case 'practice:access':
      if (subject.role !== 'doctor') return deny('clinic app is for clinicians')
      if (subject.kyc_level !== 'verified') return deny('clinician is not verified yet')
      return allow('verified clinician')

    case 'admin:access':
      return subject.role === 'admin' ? allow('admin') : deny('not an admin')

    default:
      return deny('no rule matched')
  }
}

/** Throws unless the action is permitted. Use at the top of a server action. */
export function assertAllowed(
  subject: Claims | null,
  action: Action,
  resource: Resource = {},
): void {
  const decision = evaluate(subject, action, resource)
  if (!decision.allow) {
    throw new PolicyError(action, decision.reason)
  }
}

export class PolicyError extends Error {
  constructor(
    readonly action: Action,
    readonly reason: string,
  ) {
    super(`Denied: ${action} — ${reason}`)
    this.name = 'PolicyError'
  }
}
