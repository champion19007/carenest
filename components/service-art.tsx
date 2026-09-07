/**
 * Illustrations for the five services.
 *
 * These are drawn against `var(--primary)` and `var(--accent)` rather than
 * fixed hex values, so the same file renders navy on white and violet on near
 * black without a second set of assets or a `.dark` override. That works
 * because globals.css defines those custom properties on `:root` and `.dark`
 * directly — a token that only exists inside Tailwind's `@theme inline` block
 * is not emitted as a custom property and would resolve to nothing here.
 *
 * Illustration rather than photography: a photograph of a lab says "this
 * particular lab", while a drawing says "lab tests", which is what a category
 * tile means.
 */

const P = 'var(--primary)'
const A = 'var(--accent)'

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 96 72" className="size-full" aria-hidden="true" focusable="false">
      <rect width="96" height="72" rx="12" fill={P} opacity="0.08" />
      {children}
    </svg>
  )
}

/** Clinic appointments — a clinic front with a cross above the door. */
function ClinicArt() {
  return (
    <Frame>
      <rect x="22" y="26" width="52" height="34" rx="4" fill={P} opacity="0.9" />
      <rect x="30" y="44" width="12" height="16" rx="2" fill={A} />
      <rect x="50" y="34" width="8" height="8" rx="1.5" fill="#fff" opacity="0.75" />
      <rect x="62" y="34" width="8" height="8" rx="1.5" fill="#fff" opacity="0.5" />
      <rect x="50" y="47" width="20" height="4" rx="2" fill="#fff" opacity="0.4" />
      <path d="M48 12v12M42 18h12" stroke={A} strokeWidth="5" strokeLinecap="round" />
    </Frame>
  )
}

/** Video consultation — a screen with a caller and a signal arc. */
function VideoArt() {
  return (
    <Frame>
      <rect x="18" y="18" width="48" height="34" rx="5" fill={P} opacity="0.9" />
      <circle cx="42" cy="31" r="6" fill="#fff" opacity="0.85" />
      <path d="M32 45c0-6 4.5-9 10-9s10 3 10 9z" fill="#fff" opacity="0.85" />
      <rect x="34" y="56" width="16" height="3" rx="1.5" fill={P} opacity="0.5" />
      <path d="M72 26a14 14 0 0 1 0 18" stroke={A} strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M78 20a22 22 0 0 1 0 30" stroke={A} strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.5" />
    </Frame>
  )
}

/** Lab tests — sample tubes, one filled. */
function LabArt() {
  return (
    <Frame>
      <rect x="26" y="14" width="13" height="44" rx="6.5" fill={P} opacity="0.85" />
      <path d="M26 38v13.5a6.5 6.5 0 0 0 13 0V38z" fill={A} />
      <rect x="45" y="22" width="13" height="36" rx="6.5" fill={P} opacity="0.55" />
      <rect x="64" y="30" width="13" height="28" rx="6.5" fill={P} opacity="0.35" />
      <path d="M18 62h62" stroke={P} strokeWidth="3" strokeLinecap="round" opacity="0.5" />
    </Frame>
  )
}

/** Planned surgery — a theatre monitor with a trace. */
function SurgeryArt() {
  return (
    <Frame>
      <rect x="16" y="16" width="64" height="38" rx="5" fill={P} opacity="0.9" />
      <path
        d="M24 36h10l4-9 6 18 5-13 4 4h19"
        stroke={A}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <rect x="42" y="54" width="12" height="6" rx="2" fill={P} opacity="0.6" />
      <rect x="32" y="60" width="32" height="4" rx="2" fill={P} opacity="0.4" />
    </Frame>
  )
}

/** Veterinary — a paw print. */
function PetArt() {
  return (
    <Frame>
      <ellipse cx="48" cy="47" rx="16" ry="13" fill={P} opacity="0.9" />
      <ellipse cx="30" cy="30" rx="7" ry="9" fill={A} transform="rotate(-18 30 30)" />
      <ellipse cx="42" cy="22" rx="6.5" ry="9" fill={P} opacity="0.75" />
      <ellipse cx="56" cy="22" rx="6.5" ry="9" fill={P} opacity="0.75" />
      <ellipse cx="68" cy="30" rx="7" ry="9" fill={A} transform="rotate(18 68 30)" />
    </Frame>
  )
}

export const serviceArt: Record<string, () => React.JSX.Element> = {
  doctors: ClinicArt,
  video: VideoArt,
  labs: LabArt,
  surgeries: SurgeryArt,
  pets: PetArt,
}
