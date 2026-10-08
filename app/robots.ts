import type {MetadataRoute} from 'next'
import {localMode} from '@/lib/secrets'
import {generateSitemaps} from './sitemap'
export const dynamic='force-dynamic'
export default async function robots():Promise<MetadataRoute.Robots>{if(localMode())return {rules:[{userAgent:'*',disallow:'/'}]};const base=process.env.APP_ORIGIN??process.env.NEXT_PUBLIC_SITE_URL??'http://localhost:3000',sitemaps=await generateSitemaps();return {rules:[{userAgent:'*',allow:'/',disallow:['/account','/dashboard','/practice','/staff','/book','/admin','/api','/join','/welcome','/sign-in']}],sitemap:sitemaps.map(s=>base+'/sitemap/'+s.id+'.xml')}}
