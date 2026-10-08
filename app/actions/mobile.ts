'use server'
import {requireUser} from '@/lib/auth'
import {pairMobile,revokeMobileDevice} from '@/lib/domain/mobile'
import {DomainError} from '@/lib/domain/errors'
import {revalidatePath} from 'next/cache'
export type MobileState={error?:string;notice?:string;code?:string}
export async function createMobilePairing(_s:MobileState):Promise<MobileState>{const u=await requireUser('/account/mobile');try{return {code:await pairMobile(u.id),notice:'Private one-use code; expires in five minutes. Paste it only into your own local CareNest mobile build.'}}catch(e){if(e instanceof DomainError)return {error:e.message};throw e}}
export async function revokeDevice(_s:MobileState,f:FormData):Promise<MobileState>{const u=await requireUser('/account/mobile');try{await revokeMobileDevice(u.id,String(f.get('id')??''));revalidatePath('/account/mobile');return {notice:'Device session revoked. Reconnect that device to clear its local queue.'}}catch(e){if(e instanceof DomainError)return {error:e.message};throw e}}
