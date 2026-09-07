import type { MetadataRoute } from 'next'
import { searchDoctors } from '@/lib/db/sql'

/* Reads the doctor table, so it is generated per request rather than at
   build time — the database is not reachable from a build worker. */
export const dynamic = 'force-dynamic'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://carenest.in'

/** Every public page, including one entry per doctor profile. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticPages = ['', '/search', '/labs', '/surgeries', '/pets', '/help', '/for-providers', '/join'].map(
    (path) => ({
      url: `${BASE}${path}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: path === '' ? 1 : 0.8,
    }),
  )

  const [humans, vets] = await Promise.all([
    searchDoctors({ kind: 'human' }),
    searchDoctors({ kind: 'vet' }),
  ])

  const doctors = [...humans, ...vets].map(
    (doctor) => ({
      url: `${BASE}/doctor/${doctor.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }),
  )

  return [...staticPages, ...doctors]
}
