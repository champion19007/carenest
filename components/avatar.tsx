/**
 * A generated avatar for a provider.
 *
 * Providers are seeded records, so there is no photograph to show and putting
 * a stock face beside a fabricated name and registration number would
 * misrepresent a real person. Initials on generated art say "no photo yet"
 * honestly, and unlike a grey placeholder they give the eye something to
 * anchor on when scanning a list.
 *
 * The colour is derived from the *speciality*, not the name, so it carries
 * information: every dermatologist in a result list shares a hue, and the
 * page becomes scannable by colour before it is read.
 */

const PALETTES = [
  { from: '#1e3a8a', to: '#3b82f6' }, // indigo
  { from: '#065f46', to: '#10b981' }, // emerald
  { from: '#7c2d12', to: '#f59e0b' }, // amber
  { from: '#581c87', to: '#a855f7' }, // violet
  { from: '#831843', to: '#ec4899' }, // pink
  { from: '#0c4a6e', to: '#06b6d4' }, // cyan
  { from: '#3f2d00', to: '#eab308' }, // gold
  { from: '#7f1d1d', to: '#f87171' }, // rose
  { from: '#134e4a', to: '#14b8a6' }, // teal
  { from: '#1e1b4b', to: '#6366f1' }, // indigo deep
  { from: '#4c1d95', to: '#8b5cf6' }, // purple
  { from: '#14532d', to: '#4ade80' }, // green
]

/**
 * The specialities we actually list, in a fixed order.
 *
 * Hashing a speciality into the palette looked tidy but collided constantly —
 * three specialities landed on one colour even after the hash was fixed, which
 * is simply what random assignment does when twelve items go into twelve
 * buckets. Because this set is small, known and slow-changing, assigning by
 * position removes the collisions entirely instead of merely making them less
 * likely.
 *
 * Order is load-bearing: inserting a speciality in the middle recolours every
 * one after it, so new entries go on the end.
 */
const SPECIALITY_ORDER = [
  'General Physician',
  'Cardiologist',
  'Gynaecologist',
  'Dermatologist',
  'Paediatrician',
  'Orthopaedic',
  'ENT Specialist',
  'Psychiatrist',
  'Neurologist',
  'Dentist',
  'Ophthalmologist',
  'Veterinarian',
]

/** Falls back to the hash for anything not on the list above. */
function paletteFor(speciality: string, name: string) {
  const known = SPECIALITY_ORDER.indexOf(speciality.trim())
  if (known !== -1) return PALETTES[known % PALETTES.length]
  return PALETTES[hash(speciality || name) % PALETTES.length]
}

/**
 * Stable across renders, servers and deploys — no randomness, no hydration gap.
 *
 * FNV-1a followed by a Murmur3 avalanche step. The avalanche is not decoration:
 * the palette length is a power of two, so `hash(x) % 8` reads only the bottom
 * three bits. A plain `h * 31 + c` accumulator barely disturbs those bits
 * between strings of similar length, which collapsed eight specialities onto
 * four colours and left half the palette unused. Mixing the high bits down
 * before the modulo is what makes the spread even.
 */
function hash(value: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

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

export function Avatar({
  name,
  speciality = '',
  size = 64,
  className = '',
}: {
  name: string
  speciality?: string
  size?: number
  className?: string
}) {
  const initials = initialsOf(name)
  const palette = paletteFor(speciality, name)
  /* Unique per avatar: two gradients with the same id on one page would make
     every later avatar reuse the first one's colours. */
  const gradientId = `av-${hash(`${name}|${speciality}`).toString(36)}`

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label={`${name}, no photograph provided`}
      className={`shrink-0 rounded-xl ${className}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.from} />
          <stop offset="100%" stopColor={palette.to} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${gradientId})`} />
      {/* Two soft highlights so the tile has depth rather than reading as a
          flat colour swatch. */}
      <circle cx="52" cy="12" r="20" fill="#ffffff" opacity="0.14" />
      <circle cx="10" cy="58" r="16" fill="#000000" opacity="0.12" />
      <text
        x="32"
        y="33"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#ffffff"
        fontSize="24"
        fontWeight="700"
        fontFamily="var(--font-display), ui-sans-serif, system-ui, sans-serif"
        letterSpacing="0.5"
      >
        {initials}
      </text>
    </svg>
  )
}
