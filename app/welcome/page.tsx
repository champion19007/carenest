import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { WelcomeForm } from '@/components/welcome-form'
import { currentUser } from '@/lib/auth'
import { destinationFor } from '@/lib/routes'

export const metadata = { title: 'Welcome · CareNest' }

/**
 * The last step of signing up: telling us who you are.
 *
 * Reached only with a live session and an empty name. Anyone who already has
 * a name is sent on, so this cannot become a page people get stuck behind or
 * can wander back into.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const user = await currentUser()

  if (!user) redirect('/sign-in')
  if (user.name) redirect(destinationFor(user.role, next))

  return (
    <main className="min-h-screen bg-surface">
      <header className="mx-auto flex max-w-[1320px] items-center justify-between px-5 py-5 lg:px-8">
        <Logo />
        <ThemeToggle compact />
      </header>

      <section className="mx-auto max-w-[520px] px-5 pb-20 pt-10">
        <div className="rounded-xl border border-border bg-card p-7 sm:p-9">
          <p className="eyebrow">One last thing</p>
          <h1 className="mt-3 text-3xl">What should we call you?</h1>
          <p className="mt-3 leading-8 text-muted-foreground">
            Clinics see this name on their calendar, so use the name you would give at a reception
            desk. You can change it later from your profile.
          </p>

          <WelcomeForm next={next} />

          <p className="mt-7 flex items-start gap-2 border-t border-border pt-5 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />
            Your number is already verified. This only adds your name to the account.
          </p>
        </div>
      </section>
    </main>
  )
}
