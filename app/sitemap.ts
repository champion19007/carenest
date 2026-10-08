import type {MetadataRoute} from 'next'
import {getDb,ensureSchema} from '@/lib/db/client'
import {localMode} from '@/lib/secrets'
export const dynamic='force-dynamic'
const base=process.env.APP_ORIGIN??process.env.NEXT_PUBLIC_SITE_URL??'http://localhost:3000'
const where="d.status='ACTIVE' AND d.verified_at IS NOT NULL AND d.is_demo=false AND u.status='ACTIVE' AND u.role='doctor' AND u.kyc_level='verified'"
export async function generateSitemaps(){if(localMode()||!process.env.DATABASE_URL)return [{id:0}];await ensureSchema();const row=await getDb().one<{n:string}>(`SELECT count(*) n FROM provider.doctors d JOIN patient.users u ON u.id=d.user_id WHERE ${where}`);return Array.from({length:Math.max(1,Math.ceil(Number(row?.n??0)/49000))},(_,id)=>({id}))}
export default async function sitemap({id}:{id:Promise<string>}):Promise<MetadataRoute.Sitemap>{
 if(localMode())return []
 await ensureSchema();const part=Math.max(0,Number(await id)||0)
 const providers=await getDb().query<{slug:string;updated_at:string}>(`SELECT d.slug,d.updated_at FROM provider.doctors d JOIN patient.users u ON u.id=d.user_id WHERE ${where} ORDER BY d.id LIMIT 49000 OFFSET $1`,[part*49000])
 const pages=part===0?['','/search','/labs','/pets','/surgeries','/help','/for-providers','/policies/privacy','/policies/terms'].map(path=>({url:base+path,changeFrequency:'weekly' as const})):[]
 return [...pages,...providers.map(d=>({url:base+'/doctor/'+d.slug,lastModified:new Date(d.updated_at),changeFrequency:'weekly' as const}))]
}
