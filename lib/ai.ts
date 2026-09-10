import 'server-only'

/**
 * The model provider.
 *
 * Follows the same shape as `lib/sms.ts`: configured by environment, and with
 * an honest inert mode when it is not configured. Nothing in the product
 * pretends to work without a key — features that depend on a model hide
 * themselves rather than showing a plausible answer that was never generated.
 *
 *   ANTHROPIC_API_KEY set → live
 *   unset                 → inert; callers get `null` and show nothing
 *
 * Every caller must handle `null`. That is deliberate: a model is a network
 * call to a third party that can be slow, rate-limited or down, and in a
 * clinical product the failure mode has to be "this section is unavailable",
 * never a fabricated summary.
 *
 * Note also what leaves the building. A hosted model means patient text is
 * sent to a third party — fine for a portfolio, a consent-and-localisation
 * problem under the DPDP Act for anything real. Callers dealing with PHI say
 * so at their call site.
 */

const API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-5'

export function aiIsLive(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

export type AiResult<T> = { ok: true; value: T } | { ok: false; reason: string }

/**
 * One completion, returning parsed JSON of the caller's shape.
 *
 * `schemaHint` is prose describing the JSON wanted. The response is validated
 * by the caller's own `parse` rather than trusted, because a model returning
 * well-formed JSON of the wrong shape is the common failure, not malformed
 * text.
 */
export async function askForJson<T>({
  system,
  prompt,
  parse,
  maxTokens = 1024,
  timeoutMs = 20_000,
}: {
  system: string
  prompt: string
  parse: (value: unknown) => T | null
  maxTokens?: number
  timeoutMs?: number
}): Promise<AiResult<T>> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { ok: false, reason: 'not-configured' }

  /* A hung request must not hold a serverless function open until the platform
     kills it — the caller needs to fall back well before that. */
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeoutMs)

  try {
    const response = await fetch(API, {
      method: 'POST',
      signal: abort.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      return { ok: false, reason: `provider-${response.status}` }
    }

    const body = (await response.json()) as { content?: { type: string; text?: string }[] }
    const text = body.content?.find((part) => part.type === 'text')?.text ?? ''

    const json = extractJson(text)
    if (json === null) return { ok: false, reason: 'unparseable' }

    const value = parse(json)
    if (value === null) return { ok: false, reason: 'wrong-shape' }

    return { ok: true, value }
  } catch (cause) {
    return {
      ok: false,
      reason: abort.signal.aborted ? 'timeout' : `error-${(cause as Error).name}`,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Pull a JSON object out of a reply.
 *
 * Models wrap JSON in prose or fences more often than the prompt asks them
 * not to, so rather than forbidding it and failing, take the first balanced
 * object. Cheaper than a retry and removes a whole class of flakiness.
 */
function extractJson(text: string): unknown {
  const trimmed = text.trim()

  try {
    return JSON.parse(trimmed)
  } catch {
    /* Fall through to scanning. */
  }

  const start = trimmed.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < trimmed.length; i++) {
    const char = trimmed[i]

    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(trimmed.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }

  return null
}

export { extractJson }
