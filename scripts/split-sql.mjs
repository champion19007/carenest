/**
 * Split a SQL script into individual statements.
 *
 * Needed because both the seed and the test harness apply the schema one
 * statement at a time, and two constructs in it defeat a naive `split(';')`:
 *
 *   -- a comment; with a semicolon in it
 *   AS $$ BEGIN … ; … END; $$
 *
 * Once inside a `$$ … $$` body the text is opaque: it is appended verbatim and
 * never re-examined. Only the newly-arrived chunk is ever split — re-splitting
 * the accumulated buffer would find the semicolons inside a body that had
 * already been protected.
 */
export function splitStatements(sql) {
  const cleaned = sql.replace(/^\s*--.*$/gm, '')
  const statements = []
  let buffer = ''
  let inDollar = false

  for (const chunk of cleaned.split(/(\$\$)/)) {
    if (chunk === '$$') {
      inDollar = !inDollar
      buffer += chunk
      continue
    }
    if (inDollar) {
      buffer += chunk
      continue
    }
    const parts = chunk.split(';')
    parts[0] = buffer + parts[0]
    buffer = parts.pop()
    for (const part of parts) if (part.trim()) statements.push(part.trim())
  }

  if (buffer.trim()) statements.push(buffer.trim())
  return statements
}
