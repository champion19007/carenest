import Link from 'next/link'
import { ArrowLeft, Users } from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { ProfileForm } from '@/components/profile-form'
import { FamilyManager } from '@/components/family-manager'
import { requireUser, newId } from '@/lib/auth'
import { ensureSelfMember, listFamily } from '@/lib/db/family'

export const metadata = { title: 'Your profile · CareNest' }

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>
}) {
  const { welcome } = await searchParams
  const user = await requireUser('/account/profile')

  /* Accounts created before family members existed pick up their own row here
     rather than needing a migration pass over the table. */
  await ensureSelfMember(user.id, user.name, newId('fam'))
  const family = await listFamily(user.id)

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />

      <section className="mx-auto max-w-[900px] px-5 py-10 lg:px-8 lg:py-14">
        <Link
          href="/dashboard/patient"
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          <ArrowLeft className="size-4" />
          Back to your dashboard
        </Link>

        <h1 className="mt-5 text-3xl font-extrabold sm:text-4xl">Your profile</h1>
        <p className="mt-2 text-muted-foreground">
          Clinics see these details on your bookings. Keeping them accurate saves time at the
          reception desk.
        </p>

        {welcome && (
          <p
            role="status"
            className="mt-6 rounded-xl border border-border bg-soft px-5 py-4 text-primary"
          >
            Welcome to CareNest. Take a moment to check your details below before you book.
          </p>
        )}

        <div className="mt-9 rounded-xl border border-border bg-card p-6 sm:p-8">
          <ProfileForm user={user} />
        </div>

        <div className="mt-8 rounded-xl border border-border bg-card p-6 sm:p-8">
          <h2 className="flex items-center gap-2.5 text-xl font-bold">
            <Users className="size-5 text-primary" />
            Family members
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Add the people you book for. At the clinic, an appointment made for your mother should
            carry her name and age, not yours.
          </p>

          <div className="mt-6">
            <FamilyManager members={family} />
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
