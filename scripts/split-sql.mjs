/**
 * Split SQL on `;`, except inside comments and `$$ … $$` bodies.
 * Only the new chunk is split; re-splitting the buffer would cut a protected body.
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
