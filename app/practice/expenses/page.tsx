import {requireRole} from '@/lib/auth'
import {workspaceExpenses} from '@/lib/domain/workspace-expenses'
import {ExpenseForm,VoidExpense} from '@/components/workspace/expense-form'
import {WorkspaceTitle,WorkspaceEmpty,WorkspaceBadge} from '@/components/workspace/ui'
import {formatPaise} from '@/lib/money'
export const dynamic='force-dynamic'
export default async function ExpensesPage(){const user=await requireRole('doctor','/practice/expenses'),rows=await workspaceExpenses(user.id);return <><WorkspaceTitle title="Expenses" description="Recorded clinic costs; voiding preserves the audit trail" actions={<ExpenseForm/>}/><div className="workspace-page">{!rows.length?<WorkspaceEmpty title="No expenses recorded" detail="Record actual expenses to include them in clinic reports."/>:<div className="workspace-table-wrap"><table className="workspace-table"><thead><tr>{['Date','Category / payee','Reference','Amount','Status','Action'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.spent_on}</td><td>{r.category}<p>{r.body.payee}</p><p className="workspace-help">{r.body.note}</p></td><td>{r.body.reference||'—'}</td><td>{formatPaise(r.amount_paise)}</td><td><WorkspaceBadge state={r.status}/></td><td>{r.status==='RECORDED'&&<VoidExpense id={r.id} revision={r.revision}/>}</td></tr>)}</tbody></table></div>}</div></>}
