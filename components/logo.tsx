import Link from 'next/link'

/**
 * Rounded-square mark with a nest/leaf glyph, set in the brand colour so it
 * flips from navy to violet with the theme.
 */
export function Logo({ compact = false, onDark = false }: { compact?: boolean; onDark?: boolean }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5">
      <span
        className={`flex size-10 items-center justify-center rounded-xl ${
          onDark ? 'bg-banner-foreground text-banner' : 'bg-cta text-cta-foreground'
        }`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 20s-6.5-4.3-6.5-9A4.5 4.5 0 0 1 12 8a4.5 4.5 0 0 1 6.5 3c0 4.7-6.5 9-6.5 9Z" strokeLinejoin="round" />
          <path d="M9.5 12.5h1.7L12 11l1 3 .8-1.5h1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {!compact && (
        <span className={`text-2xl font-extrabold tracking-[-0.03em] ${onDark ? 'text-banner-foreground' : ''}`}>
          Care<span className="text-accent">Nest</span>
        </span>
      )}
    </Link>
  )
}
