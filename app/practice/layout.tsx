import { PracticeShell } from '@/components/practice-shell'
import { requireRole } from '@/lib/auth'

/**
 * The clinic app holds other people's medical records, so a patient session
 * is not enough — the account must carry the `doctor` role. Middleware only
 * checks that a session cookie exists; this is the real gate.
 */
export default async function PracticeLayout({ children }: { children: React.ReactNode }) {
  await requireRole('doctor', '/practice/patients')
  return <PracticeShell>{children}</PracticeShell>
}
