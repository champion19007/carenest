import type { MetadataRoute } from 'next'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://carenest.in'

/**
 * Browsing pages are indexable; anything holding a person's own data is not.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/account', '/dashboard', '/practice', '/book', '/admin', '/api'],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  }
}
