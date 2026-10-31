export function initialsOf(name: string) {
  return (
    name
      .replace(/^Dr\.?\s*/i, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

// Initials distinguish providers without attaching a stock face to a sample record.
export function Avatar({name, size = 64, className = ''}: {
  name: string
  speciality?: string
  size?: number
  className?: string
}) {
  return <svg viewBox="0 0 64 64" width={size} height={size} role="img"
    aria-label={`${name}, no photograph provided`} className={`provider-avatar shrink-0 ${className}`}>
    <rect x=".5" y=".5" width="63" height="63" rx="12" fill="var(--surface)" stroke="var(--border)" />
    <text x="32" y="33" textAnchor="middle" dominantBaseline="central" fill="var(--muted-foreground)"
      fontSize="22" fontWeight="500" fontFamily="var(--font-inter), ui-sans-serif, system-ui, sans-serif">
      {initialsOf(name)}
    </text>
  </svg>
}
