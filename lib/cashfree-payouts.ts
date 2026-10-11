import 'server-only'
import {publicEncrypt,constants,createPublicKey} from 'node:crypto'
import {readFileSync,statSync} from 'node:fs'
import path from 'node:path'
import {DomainError,reject} from './domain/errors'
import {localMode} from './secrets'
import {cashfreeAmount} from './cashfree'
import {decimalRupees,paise} from './money'

export function payoutsConfigured(){return localMode()&&process.env.CASHFREE_ENV==='sandbox'&&process.env.ENABLE_DOCTOR_PAYOUTS==='1'&&Boolean(process.env.CASHFREE_PAYOUT_CLIENT_ID?.trim()&&process.env.CASHFREE_PAYOUT_CLIENT_SECRET?.trim())}
function payoutSignatureHeaders():Record<string,string>{
 const file=process.env.CASHFREE_PAYOUT_PUBLIC_KEY_PATH?.trim()
 if(!file)return {}
 try{
  const location=path.resolve(file)
  if(statSync(location).size>16384)throw new Error()
  const pem=readFileSync(location,'utf8')
  if(!pem.includes('-----BEGIN PUBLIC KEY-----')||pem.includes('PRIVATE KEY'))throw new Error()
  const key=createPublicKey(pem);if(key.asymmetricKeyType!=='rsa'||(key.asymmetricKeyDetails?.modulusLength??0)<2048)throw new Error()
  const plaintext=process.env.CASHFREE_PAYOUT_CLIENT_ID!+'.'+Math.floor(Date.now()/1000)
  return {'x-cf-signature':publicEncrypt({key,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha1'},Buffer.from(plaintext)).toString('base64')}
 }catch{reject('PAYOUT_PUBLIC_KEY','Save the Cashfree TEST RSA public key and set its local file path. A matching Payouts account/client ID is required.',503)}
}
export async function payoutRequest(path:string,method='GET',body?:unknown):Promise<any>{
 if(!payoutsConfigured())reject('PAYOUT_SETUP','Cashfree Payouts sandbox credentials and activation are required.',503)
 let response:Response
 const signatures=payoutSignatureHeaders()
 try{response=await fetch('https://sandbox.cashfree.com/payout/'+path,{method,cache:'no-store',headers:{'x-client-id':process.env.CASHFREE_PAYOUT_CLIENT_ID!,'x-client-secret':process.env.CASHFREE_PAYOUT_CLIENT_SECRET!,'x-api-version':'2024-01-01','Content-Type':'application/json',...signatures},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)})}
 catch{throw new DomainError('PAYOUT_UNKNOWN','Payout outcome is unknown; reconcile the saved transfer before any retry.',503)}
 if(!response.ok){
  const failure=await response.json().catch(()=>null)
  if(response.status===403&&typeof failure?.message==='string'&&/IP not whitelisted/i.test(failure.message))reject('PAYOUT_IP_WHITELIST','Add this server’s public IPv4 to Cashfree Payouts → Developers → Two-Factor Authentication → IP Whitelist.',503)
  reject(response.status===404?'PAYOUT_NOT_FOUND':'PAYOUT_PROVIDER','Cashfree Payouts could not confirm this operation. Check activation, sandbox balance and API access.',response.status===404?404:502)
 }
 try{return await response.json()}catch{reject('PAYOUT_UNKNOWN','Unreadable payout response; reconciliation required.',502)}
}
export async function verifiedBeneficiary(id:string){
 if(!/^[a-zA-Z0-9_]{1,50}$/.test(id))reject('BENEFICIARY','Enter a valid Cashfree beneficiary ID.',400)
 const row=await payoutRequest('beneficiary?beneficiary_id='+encodeURIComponent(id))
 if(row.beneficiary_id!==id||row.beneficiary_status!=='VERIFIED')reject('BENEFICIARY','Cashfree must verify the beneficiary before payouts.',409)
 return row
}
export async function transferStatus(id:string){return payoutRequest('transfers?transfer_id='+encodeURIComponent(id))}
export async function createTransfer(id:string,beneficiaryId:string,amount:string){
 if(!/^[a-zA-Z0-9_]{1,40}$/.test(id)||paise(amount)<100n||paise(amount)>100000000n)reject('PAYOUT_AMOUNT','Invalid saved payout amount or transfer ID.',400)
 try{await verifiedBeneficiary(beneficiaryId)}catch(error){throw new DomainError('PAYOUT_DESTINATION',error instanceof DomainError?error.message:'Payout destination could not be verified. No transfer was submitted.',503)}
 return payoutRequest('transfers','POST',{transfer_id:id,transfer_amount:Number(decimalRupees(amount)),transfer_currency:'INR',beneficiary_details:{beneficiary_id:beneficiaryId}})
}
export function assertTransfer(row:any,id:string,beneficiaryId:string,amount:string){
 if(row.transfer_id!==id||row.beneficiary_details?.beneficiary_id!==beneficiaryId||cashfreeAmount(row.transfer_amount)!==amount||(row.transfer_currency!==undefined&&row.transfer_currency!=='INR')||!/^\d{1,40}$/.test(String(row.cf_transfer_id)))reject('PAYOUT_MISMATCH','Provider transfer evidence differs from the saved payout.',502)
}
