import {istDate} from '@/lib/practice-calendar'
import 'server-only'
import {randomUUID} from 'node:crypto'
import {encryptSecret,decryptSecret} from '@/lib/secrets'
import {rupeesToPaise} from '@/lib/money'
import {boundedText,reject} from './errors'
import {workspaceTransaction,workspaceKey,requestDigest,workspaceAudit,dateOnly} from './workspace-access'
export const expenseCategories=['Rent','Staff','Supplies','Equipment','Software','Utilities','Other'] as const
export async function recordWorkspaceExpense(actorId:string,input:{date:string;category:string;amount:string;payee:string;reference:string;note:string;attested:boolean;requestKey:string}){
 const key=workspaceKey(input.requestKey),date=dateOnly(input.date);let amount:string;try{amount=rupeesToPaise(input.amount);if(BigInt(amount)<1n||BigInt(amount)>100000000n)throw new Error()}catch{reject('AMOUNT','Enter a valid positive expense amount up to ₹10 lakh.',400)}
 if(!expenseCategories.includes(input.category as typeof expenseCategories[number])||!input.attested||date>istDate())reject('EXPENSE','Choose a category and attest an actual expense on a valid date.',400)
 const body={payee:boundedText(input.payee,120,2),reference:boundedText(input.reference,120),note:boundedText(input.note,2000)},hash=requestDigest([date,input.category,amount!,body])
 return workspaceTransaction(actorId,async(tx,d)=>{const prior=await tx.one<{id:string;request_hash:string}>('SELECT id,request_hash FROM clinic.workspace_expenses WHERE doctor_id=$1 AND request_key=$2',[d.id,key]);if(prior){if(prior.request_hash!==hash)reject('IDEMPOTENCY','This expense receipt request changed.');return prior.id}
 const id='expense_'+randomUUID();await tx.query('INSERT INTO clinic.workspace_expenses(id,doctor_id,spent_on,category,amount_paise,encrypted_body,request_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,d.id,date,input.category,amount!,encryptSecret(JSON.stringify(body),'expense:'+id),key,hash]);await workspaceAudit(tx,actorId,'practice:expense-recorded',id);return id
 },true)
}
export async function workspaceExpenses(actorId:string){return workspaceTransaction(actorId,async(tx,d)=>{const rows=await tx.query<{id:string;spent_on:string;category:string;amount_paise:string;encrypted_body:string;status:string;revision:number}>('SELECT * FROM clinic.workspace_expenses WHERE doctor_id=$1 ORDER BY spent_on DESC,created_at DESC LIMIT 500',[d.id]);await workspaceAudit(tx,actorId,'practice:expenses-read',d.id);return rows.map(({encrypted_body,...r})=>({...r,body:JSON.parse(decryptSecret(encrypted_body,'expense:'+r.id)) as {payee:string;reference:string;note:string}}))})}
export async function voidWorkspaceExpense(actorId:string,id:string,revision:number){return workspaceTransaction(actorId,async(tx,d)=>{if(!await tx.one("UPDATE clinic.workspace_expenses SET status='VOID',revision=revision+1 WHERE id=$1 AND doctor_id=$2 AND revision=$3 AND status='RECORDED' RETURNING id",[id,d.id,revision]))reject('CHANGED','This expense changed or is unavailable.',409);await workspaceAudit(tx,actorId,'practice:expense-voided',id)},true)}
