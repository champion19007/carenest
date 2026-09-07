import { photoUrl, type photos } from '@/lib/images'

type Photo = (typeof photos)[keyof typeof photos]

/**
 * A photograph, cropped to a ratio and tinted into the brand palette.
 *
 * Stock photography is lit for whatever room it was shot in, so dropping it
 * straight onto the page makes a site look like a collage of other people's
 * brands. The scrim — a gradient built from `--primary` — pulls every photo
 * towards navy in the light theme and violet in the dark one, which is what
 * makes a mixed set read as one product.
 *
 * Rendered as a plain `img` rather than `next/image` because
 * `images.unoptimized` is on: Unsplash resizes on its own CDN, so Next would
 * add a hop without adding anything.
 */
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
    soft: 'after:absolute after:inset-0 after:bg-gradient-to-tr after:from-primary/45 after:via-primary/10 after:to-transparent',
    strong:
      'after:absolute after:inset-0 after:bg-gradient-to-t after:from-primary/85 after:via-primary/45 after:to-primary/10',
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
