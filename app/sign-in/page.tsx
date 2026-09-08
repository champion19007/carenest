import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { SignInForm } from '@/components/sign-in-form'
import { destinationForUser } from '@/lib/routes'
import { currentUser } from '@/lib/auth'
import { googleIsConfigured } from '@/lib/google'

export const metadata = { title: 'Log in · CareNest' }

/**
 * What the Google callback's error codes mean to a person.
 *
 * Written for the reader rather than the log: "google-state" tells a developer
 * the CSRF check failed and tells everyone else nothing at all.
 */
const GOOGLE_ERRORS: Record<string, string> = {
  'google-not-configured': 'Google sign-in is not switched on for this site. Use your mobile number instead.',
  'google-cancelled': 'You cancelled the Google sign-in. Nothing was changed.',
  'google-state': 'That sign-in link expired or did not come from here. Please try again.',
  'google-exchange': 'Google could not confirm that sign-in. Please try again.',
  'google-unverified': 'That Google account has an unverified email address, so we cannot use it to sign you in.',
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { next, error } = await searchParams
  const user = await currentUser()
  if (user) redirect(destinationForUser(user, next))

  return (
    <main className="min-h-screen bg-surface">
      <header className="mx-auto flex max-w-[1320px] items-center justify-between px-5 py-5 lg:px-8">
        <Logo />
        <div className="flex items-center gap-3">
          <ThemeToggle compact />
          <Link href="/" className="text-sm font-semibold text-primary hover:underline">
            Back to home
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1100px] gap-10 px-5 pb-20 pt-6 lg:grid-cols-[1fr_22rem] lg:px-8">
        <div className="rounded-xl border border-border bg-card p-7 sm:p-9">
          <p className="eyebrow">Patient login</p>
          <h1 className="mt-3 text-4xl">Log in to CareNest</h1>
          <p className="mt-3 max-w-md leading-8 text-muted-foreground">
            We send a 6-digit code to your mobile number. There is no password to remember — and
            nobody can sign in without your phone.
          </p>

          {error && (
            <p
              role="alert"
              className="mt-6 rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning"
            >
              {GOOGLE_ERRORS[error] ?? 'Something went wrong signing you in. Please try again.'}
            </p>
          )}

          <SignInForm next={next} google={googleIsConfigured()} />
        </div>

        <aside className="h-fit rounded-xl border border-border bg-background p-6">
          <h2 className="text-xl">Why do I need an account?</h2>
          <ul className="mt-4 space-y-4 text-[0.95rem] leading-7 text-muted-foreground">
            <li>
              <strong className="text-foreground">To hold your slot.</strong> A clinic calendar is
              a real, limited resource. We only block a slot against a verified phone number so
              people can&apos;t reserve appointments they never intend to keep.
            </li>
            <li>
              <strong className="text-foreground">To keep your records together.</strong>{' '}
              Prescriptions and lab reports from every visit stay in one place instead of a folder
              of paper.
            </li>
            <li>
              <strong className="text-foreground">To check your insurance.</strong> Cashless
              eligibility has to be verified against a named policyholder before you arrive.
            </li>
          </ul>

          <p className="mt-6 flex items-start gap-2 border-t border-border pt-5 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />
            Your number is used for booking updates only. We never sell it, and we never pass it to
            advertisers.
          </p>
        </aside>
      </section>
    </main>
  )
}
