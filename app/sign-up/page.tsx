import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Check } from 'lucide-react'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { SignInForm } from '@/components/sign-in-form'
import { currentUser } from '@/lib/auth'

export const metadata = { title: 'Create an account · CareNest' }

const included = [
  'Search and book verified doctors near you',
  'Video consultations with a digital prescription',
  'Lab tests with free home sample collection',
  'Planned surgery with the cost agreed in writing',
  'Vets for dogs, cats, birds and cattle',
  'All your prescriptions and reports in one place',
]

export default async function SignUpPage() {
  if (await currentUser()) redirect('/dashboard/patient')

  return (
    <main className="min-h-screen bg-surface">
      <header className="mx-auto flex max-w-[1320px] items-center justify-between px-5 py-5 lg:px-8">
        <Logo />
        <div className="flex items-center gap-3">
          <ThemeToggle compact />
          <Link href="/sign-in" className="text-sm font-semibold text-primary hover:underline">
            Already have an account?
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1100px] gap-10 px-5 pb-20 pt-6 lg:grid-cols-[1fr_22rem] lg:px-8">
        <div className="rounded-xl border border-border bg-card p-7 sm:p-9">
          <p className="eyebrow">New account</p>
          <h1 className="mt-3 text-4xl">Create your CareNest account</h1>
          <p className="mt-3 max-w-md leading-8 text-muted-foreground">
            You only need a mobile number. We text you a 6-digit code to confirm it — there is no
            password to choose or forget, and we never ask for card details to sign up.
          </p>

          <SignInForm next="/dashboard/patient" />

          <p className="mt-8 border-t border-border pt-5 text-sm leading-6 text-muted-foreground">
            By continuing you agree to our{' '}
            <Link href="/help/privacy/how-we-use-data" className="font-semibold text-primary underline">
              terms of use and privacy policy
            </Link>
            . You can delete your account and records at any time from account settings.
          </p>
        </div>

        <aside className="h-fit rounded-xl border border-border bg-background p-6">
          <h2 className="text-xl">What you get</h2>
          <ul className="mt-5 space-y-3">
            {included.map((item) => (
              <li key={item} className="flex gap-3 text-[0.95rem] leading-7">
                <Check className="mt-1.5 size-4 shrink-0 text-accent" />
                {item}
              </li>
            ))}
          </ul>

          <p className="mt-6 border-t border-border pt-5 text-sm leading-6 text-muted-foreground">
            Free to join. There is no booking fee and no subscription — you pay the clinic, lab or
            hospital directly for the care you receive.
          </p>
        </aside>
      </section>
    </main>
  )
}
