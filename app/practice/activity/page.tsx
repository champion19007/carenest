import {requireRole} from '@/lib/auth'
import {workspaceActivity} from '@/lib/domain/workspace-reports'
import {WorkspaceTitle} from '@/components/workspace/ui'
import {slotDay,slotTime} from '@/lib/slot-format'
export const dynamic='force-dynamic'
export default async function ActivityPage(){const user=await requireRole('doctor','/practice/activity'),rows=await workspaceActivity(user.id);return <><WorkspaceTitle title="Activity" description="Your latest 200 audited actions"/><div className="workspace-page"><div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>When (IST)</th><th>Action</th><th>Reference</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{slotDay(r.created_at)} · {slotTime(r.created_at)}</td><td>{r.action}</td><td className="break-all">{r.resource}</td></tr>)}</tbody></table></div></div></>}
