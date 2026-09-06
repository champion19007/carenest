import type { MetadataRoute } from 'next'
import { searchDoctors } from '@/lib/db/sql'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://carenest.in'

/** Every public page, including one entry per doctor profile. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const staticPages = ['', '/search', '/labs', '/surgeries', '/pets', '/help', '/for-providers', '/join'].map(
    (path) => ({
      url: `${BASE}${path}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: path === '' ? 1 : 0.8,
    }),
  )

  const doctors = [...searchDoctors({ kind: 'human' }), ...searchDoctors({ kind: 'vet' })].map(
    (doctor) => ({
      url: `${BASE}/doctor/${doctor.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }),
  )

  return [...staticPages, ...doctors]
}
