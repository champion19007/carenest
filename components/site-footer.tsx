import Link from 'next/link'
import { Logo } from './logo'
import { ThemeToggle } from './theme-toggle'

const columns: { heading: string; links: string[] }[] = [
  {
    heading: 'For patients',
    links: ['Search doctors', 'Video consultation', 'Book lab tests', 'Surgeries', 'Pet care', 'My bookings'],
  },
  {
    heading: 'For doctors',
    links: ['List your practice', 'For doctors & clinics', 'ABDM compliance', 'Partner hospitals'],
  },
  {
    heading: 'Company',
    links: ['About us', 'Careers', 'Press', 'Contact us', 'Help centre'],
  },
  {
    heading: 'Policies',
    links: ['Terms of use', 'Privacy policy', 'Grievance redressal', 'Refund policy'],
  },
]

export function SiteFooter() {
  return (
    <footer className="bg-banner text-banner-foreground">
      <div className="mx-auto max-w-[1320px] px-5 py-14 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div>
            <Logo onDark />
            <p className="mt-5 max-w-xs text-sm leading-6 text-banner-muted">
              Book verified doctors, video consults and lab tests across India — with cashless and
              Ayushman Bharat support at partner clinics.
            </p>
            <div className="mt-6">
              <ThemeToggle />
            </div>
          </div>

          {columns.map(({ heading, links }) => (
            <div key={heading}>
              <h2 className="font-bold">{heading}</h2>
              <ul className="mt-4 space-y-2.5">
                {links.map((link) => (
                  <li key={link}>
                    <Link
                      href="/help"
                      className="text-sm text-banner-muted transition-colors hover:text-banner-foreground"
                    >
                      {link}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-banner-foreground/20 pt-8">
          <p className="max-w-4xl text-sm leading-6 text-banner-muted">
            CareNest is a booking platform and does not provide medical advice, diagnosis or
            treatment. Content on this site is for general information only. Always consult a
            registered medical practitioner for concerns about your health. In an emergency, call
            108 or visit your nearest hospital.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-banner-muted">
            <span>© 2026 CareNest Health Technologies Pvt. Ltd.</span>
            <span>CIN: U62099MH2026PTC000000</span>
            <span>Made in India 🇮🇳</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
