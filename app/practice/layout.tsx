import { PracticeShell } from '@/components/practice-shell'
import { requireRole } from '@/lib/auth'
import {findDoctorByUserId} from '@/lib/db/sql'

/**
 * The clinic app holds other people's medical records, so a patient session
 * is not enough — the account must carry the `doctor` role. Middleware only
 * checks that a session cookie exists; this is the real gate.
 */
export default async function PracticeLayout({ children }: { children: React.ReactNode }) {
  const user=await requireRole('doctor', '/practice/patients'),doctor=await findDoctorByUserId(user.id)
  return <PracticeShell clinicianName={user.name} clinicLabel={doctor?[doctor.clinic,doctor.locality].filter(Boolean).join(' · '):'Your practice'}>{children}</PracticeShell>
}
