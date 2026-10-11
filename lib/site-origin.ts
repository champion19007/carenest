/** Public URLs use configured origins or Vercel's own domain, never request headers. */
export function siteOrigin(env:NodeJS.ProcessEnv=process.env){
 const automatic=env.VERCEL_PROJECT_PRODUCTION_URL??env.VERCEL_URL
 const raw=env.APP_ORIGIN??env.NEXT_PUBLIC_SITE_URL??(automatic?'https://'+automatic:'http://localhost:3000')
 const url=new URL(raw)
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('Configure a trusted public site origin')
 return url.origin
}
