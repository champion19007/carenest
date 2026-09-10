import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * The deterministic half of the AI features.
 *
 * A model's output cannot be asserted, so what is tested here is everything
 * around it: the JSON extraction that has to cope with a model wrapping its
 * answer in prose, and the validation that decides whether a reply is
 * trustworthy enough to store. Those are the parts that turn an unreliable
 * dependency into a safe one, and they are pure functions.
 */

/* Mirrors extractJson in lib/ai.ts. */
function extractJson(text) {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    /* scan */
  }
  const start = trimmed.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < trimmed.length; i++) {
    const char = trimmed[i]
    if (escaped) { escaped = false; continue }
    if (char === '\\') { escaped = true; continue }
    if (char === '"') { inString = !inString; continue }
    if (inString) continue
    if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) {
        try { return JSON.parse(trimmed.slice(start, i + 1)) } catch { return null }
      }
    }
  }
  return null
}

/* Mirrors parseTriage in lib/triage.ts. */
function parseTriage(value) {
  if (typeof value !== 'object' || value === null) return null
  const raw = value
  const urgency = raw.urgency
  if (urgency !== 'routine' && urgency !== 'soon' && urgency !== 'urgent') return null
  if (typeof raw.looksGenuine !== 'boolean') return null
  if (typeof raw.summary !== 'string') return null
  return {
    looksGenuine: raw.looksGenuine,
    urgency,
    summary: raw.summary.slice(0, 140),
    procedure: typeof raw.procedure === 'string' ? raw.procedure.slice(0, 80) : 'Unclear',
    concerns: Array.isArray(raw.concerns)
      ? raw.concerns.filter((c) => typeof c === 'string').slice(0, 3)
      : [],
  }
}

test('plain JSON parses', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 })
})

test('JSON wrapped in prose still parses', () => {
  const reply = 'Sure! Here is the triage:\n\n{"urgency":"soon"}\n\nHope that helps.'
  assert.deepEqual(extractJson(reply), { urgency: 'soon' })
})

test('JSON in a fenced block still parses', () => {
  assert.deepEqual(extractJson('```json\n{"urgency":"urgent"}\n```'), { urgency: 'urgent' })
})

test('nested objects are not truncated at the first brace', () => {
  const reply = 'text {"a":{"b":{"c":2}},"d":3} trailing'
  assert.deepEqual(extractJson(reply), { a: { b: { c: 2 } }, d: 3 })
})

test('a brace inside a string does not end the object', () => {
  const reply = '{"summary":"patient wrote } in their message","urgency":"routine"}'
  assert.equal(extractJson(reply).urgency, 'routine')
})

test('an escaped quote does not end the string', () => {
  const reply = String.raw`{"summary":"they said \"it hurts\"","urgency":"soon"}`
  assert.equal(extractJson(reply).urgency, 'soon')
})

test('a reply with no JSON returns null rather than throwing', () => {
  assert.equal(extractJson('I cannot help with that.'), null)
  assert.equal(extractJson(''), null)
  assert.equal(extractJson('{ this is not json'), null)
})

test('a well-formed reply of the wrong shape is rejected', () => {
  /* The common failure is not malformed text but valid JSON that does not
     mean what the caller expects. */
  assert.equal(parseTriage({ urgency: 'critical', looksGenuine: true, summary: 'x' }), null)
  assert.equal(parseTriage({ urgency: 'soon', looksGenuine: 'yes', summary: 'x' }), null)
  assert.equal(parseTriage({ urgency: 'soon', looksGenuine: true }), null)
  assert.equal(parseTriage(null), null)
  assert.equal(parseTriage([1, 2, 3]), null)
})

test('a valid reply is normalised, not trusted verbatim', () => {
  const parsed = parseTriage({
    looksGenuine: true,
    urgency: 'urgent',
    summary: 'x'.repeat(500),
    procedure: 'y'.repeat(200),
    concerns: ['a', 'b', 'c', 'd', 'e', 42],
  })
  assert.equal(parsed.summary.length, 140, 'a long summary must not break the queue layout')
  assert.equal(parsed.procedure.length, 80)
  assert.equal(parsed.concerns.length, 3)
  assert.ok(parsed.concerns.every((c) => typeof c === 'string'))
})

test('missing optional fields fall back rather than failing', () => {
  const parsed = parseTriage({ looksGenuine: true, urgency: 'routine', summary: 'ok' })
  assert.equal(parsed.procedure, 'Unclear')
  assert.deepEqual(parsed.concerns, [])
})

test('urgency ordering puts serious enquiries first', () => {
  const rank = { urgent: 0, soon: 1, routine: 2 }
  const queue = [
    { id: 'a', urgency: 'routine' },
    { id: 'b', urgency: 'urgent' },
    { id: 'c', urgency: 'soon' },
  ].sort((x, y) => rank[x.urgency] - rank[y.urgency])
  assert.deepEqual(queue.map((q) => q.id), ['b', 'c', 'a'])
})
