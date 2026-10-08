export class DomainError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message); this.name = 'DomainError' }
}
export function reject(code: string, message: string, status = 409): never { throw new DomainError(code, message, status) }
export function boundedText(value: unknown, maximum: number, minimum = 0) {
  if (typeof value !== 'string') reject('VALIDATION', 'Check the submitted fields.', 400)
  const text = value.trim()
  if (text.length < minimum || text.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) reject('VALIDATION', 'Check the submitted fields.', 400)
  return text
}
