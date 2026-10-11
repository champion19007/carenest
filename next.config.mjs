import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.dirname(fileURLToPath(import.meta.url))
/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root }, outputFileTracingRoot: root, devIndicators: false,
  poweredByHeader:false,compress:true,
  ...(process.env.DOCKER_BUILD==='1'?{output:'standalone'}:{}),
  outputFileTracingExcludes: {'/*':['./.data/**/*','./.env*','./docs/**/*','./tests/**/*','./apps/mobile/**/*','./infra/**/*']},
  images: { remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }],formats:['image/avif','image/webp'],minimumCacheTTL:86400 },
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
}
export default nextConfig
