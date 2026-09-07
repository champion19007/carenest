/**
 * Artwork for "nothing here".
 *
 * An empty result is the moment a search feels broken, so the panel gets a
 * drawing rather than three lines of grey text. Drawn from the theme tokens
 * so it does not glare in dark mode.
 */
export function EmptyArt({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 110"
      className={`mx-auto h-28 w-auto ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="80" cy="98" rx="52" ry="7" fill="var(--primary)" opacity="0.1" />
      {/* A magnifier over an empty appointment card. */}
      <rect x="34" y="18" width="62" height="66" rx="8" fill="var(--primary)" opacity="0.1" />
      <rect x="34" y="18" width="62" height="66" rx="8" fill="none" stroke="var(--primary)" strokeWidth="2" opacity="0.35" />
      <rect x="46" y="32" width="38" height="5" rx="2.5" fill="var(--primary)" opacity="0.3" />
      <rect x="46" y="45" width="26" height="5" rx="2.5" fill="var(--primary)" opacity="0.22" />
      <rect x="46" y="58" width="32" height="5" rx="2.5" fill="var(--primary)" opacity="0.22" />
      <circle cx="104" cy="62" r="22" fill="var(--background)" opacity="0.9" />
      <circle cx="104" cy="62" r="22" fill="none" stroke="var(--accent)" strokeWidth="5" />
      <path d="M120 78l14 14" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round" />
    </svg>
  )
}
