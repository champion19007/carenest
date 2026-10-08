import {requireRole} from '@/lib/auth'
import {redirect} from 'next/navigation'
export default async function ProviderDashboard(){await requireRole('doctor','/practice/requests');redirect('/practice/requests')}
