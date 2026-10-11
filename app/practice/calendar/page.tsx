import {requireRole} from '@/lib/auth'
import {workspaceCalendar} from '@/lib/domain/workspace-calendar'
import {workspaceSettings} from '@/lib/domain/workspace-settings'
import {clinicContacts} from '@/lib/domain/workspace-patients'
import {CalendarWorkspace} from '@/components/workspace/calendar-view'
export const dynamic='force-dynamic'
export default async function CalendarPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const user=await requireRole('doctor','/practice/calendar'),params=await searchParams
 const [settings,contacts]=await Promise.all([workspaceSettings(user.id),clinicContacts(user.id)])
 const data=await workspaceCalendar(user.id,typeof params.day==='string'?params.day:undefined,typeof params.view==='string'?params.view:settings.preferences.calendar.defaultView)
 return <CalendarWorkspace {...data} contacts={contacts} display={settings.preferences.calendar}/>
}
