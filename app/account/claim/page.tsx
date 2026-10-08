import {requireUser} from '@/lib/auth'
import {ClaimVisitForm} from '@/components/operations-forms'
import {PatientWorkspace} from '@/components/patient-workspace'
export const dynamic='force-dynamic'
export default async function ClaimVisit(){await requireUser('/account/claim');return <PatientWorkspace title="Link a clinic visit" description="Use the private receipt handed to you at the clinic. Your signed-in, verified phone must match the clinic’s recorded contact."><ClaimVisitForm/></PatientWorkspace>}
