/**
 * Photography used across the site.
 *
 * Every URL is an Unsplash CDN address with sizing baked into the query
 * string, so the CDN does the resizing and Next's image optimiser — and its
 * per-deployment transform quota — is never involved. That is why
 * `images.unoptimized` stays true in next.config.mjs.
 *
 * Each entry was opened and looked at before being listed. Two rules decided
 * what survived:
 *
 *   - No photograph is ever attached to a named doctor. Our providers are
 *     seeded records; putting a real person's face beside a fabricated name
 *     and registration number misrepresents that person. Named providers get
 *     a generated avatar instead (see `components/avatar.tsx`).
 *   - Nothing carrying another company's branding, a legible name badge, or a
 *     pandemic register that would date the page.
 */

type Photo = {
  /** Unsplash photo id. */
  id: string
  /** Described for a screen reader, not repeated from the heading. */
  alt: string
  /**
   * Which part of the frame must survive cropping, as a CSS object-position.
   * Wide banners crop hard on phones and the subject is rarely centred.
   */
  focus: string
}

const CDN = 'https://images.unsplash.com'

/** A sized, format-negotiated URL for one of the photos below. */
export function photoUrl(photo: Photo, width: number, ratio?: number) {
  const params = new URLSearchParams({
    auto: 'format',
    fit: 'crop',
    q: '72',
    w: String(width),
  })
  if (ratio) params.set('h', String(Math.round(width / ratio)))
  return `${CDN}/${photo.id}?${params.toString()}`
}

export const photos = {
  /* Home ------------------------------------------------------------- */
  heroConsult: {
    id: 'photo-1631217868264-e5b90bb7e133',
    alt: 'A doctor in a white coat going through a report with a patient, both smiling',
    focus: '50% 35%',
  },
  clinicianPhone: {
    id: 'photo-1576091160399-112ba8d25d1d',
    alt: 'A clinician in a white coat with a stethoscope, checking a phone',
    focus: '50% 50%',
  },
  reception: {
    id: 'photo-1519494026892-80bbd2d6fd0d',
    alt: 'The reception desk of a bright, modern clinic',
    focus: '50% 50%',
  },

  /* Video consultation ------------------------------------------------ */
  teleconsult: {
    id: 'photo-1576091160550-2173dba999ef',
    alt: 'Hands typing on a laptop beside a stethoscope',
    focus: '50% 45%',
  },

  /* Labs -------------------------------------------------------------- */
  lab: {
    id: 'photo-1579154204601-01588f351e67',
    alt: 'A technician working between rows of automated diagnostic analysers',
    focus: '50% 50%',
  },

  /* Surgery ----------------------------------------------------------- */
  theatre: {
    id: 'photo-1551601651-2a8555f1a136',
    alt: 'Two surgeons operating under theatre lights',
    focus: '50% 45%',
  },
  theatreTeam: {
    id: 'photo-1579684385127-1ef15d508118',
    alt: 'A surgical team in masks and caps, seen from below beside the operating light',
    focus: '50% 50%',
  },

  /* Pets -------------------------------------------------------------- */
  petDog: {
    id: 'photo-1583337130417-3346a1be7dee',
    alt: 'A French bulldog in a yellow hooded top against a bright blue backdrop',
    focus: '55% 45%',
  },
  petCat: {
    id: 'photo-1628009368231-7bb7cfcb0def',
    alt: 'A woman holding a tabby cat’s face gently in both hands',
    focus: '60% 45%',
  },
  petSmall: {
    id: 'photo-1548767797-d8c844163c4c',
    alt: 'Two guinea pigs eating shredded carrot',
    focus: '50% 50%',
  },

  /* Providers --------------------------------------------------------- */
  providerStethoscope: {
    id: 'photo-1532938911079-1b06ac7ceec7',
    alt: 'A doctor standing with arms folded, holding a red stethoscope',
    focus: '55% 50%',
  },
  providerPortrait: {
    id: 'photo-1559839734-2b71ea197ec2',
    alt: 'A doctor in a white coat standing outdoors among trees',
    focus: '50% 35%',
  },
} satisfies Record<string, Photo>

export type PhotoKey = keyof typeof photos
