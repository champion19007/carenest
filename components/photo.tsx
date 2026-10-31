import { photoUrl, type photos } from '@/lib/images'

type Photo = (typeof photos)[keyof typeof photos]

// Unsplash supplies resized sources; a neutral scrim keeps overlaid text
// independent of the theme's changing link colour.
export function Photo({
  photo,
  ratio = 16 / 9,
  width = 1200,
  className = '',
  scrim = 'soft',
  priority = false,
  children,
}: {
  photo: Photo
  /** Width ÷ height. */
  ratio?: number
  /** Rendered width at 1x; a 2x source is requested alongside it. */
  width?: number
  className?: string
  /** `none` for decorative use, `strong` when text sits on top. */
  scrim?: 'none' | 'soft' | 'strong'
  priority?: boolean
  children?: React.ReactNode
}) {
  const scrimClass = {
    none: '',
    soft: 'after:absolute after:inset-0 after:bg-black/10',
    strong:
      'after:absolute after:inset-0 after:bg-black/75',
  }[scrim]

  return (
    <div
      className={`relative isolate overflow-hidden bg-soft ${scrimClass} ${className}`}
      style={{ aspectRatio: String(ratio) }}
    >
      <img
        src={photoUrl(photo, width, ratio)}
        srcSet={`${photoUrl(photo, width, ratio)} 1x, ${photoUrl(photo, width * 2, ratio)} 2x`}
        alt={photo.alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        className="size-full object-cover"
        style={{ objectPosition: photo.focus }}
      />
      {children ? <div className="absolute inset-0 z-10">{children}</div> : null}
    </div>
  )
}
