import { Analytics } from '@vercel/analytics/next'
import { Inter, Plus_Jakarta_Sans } from 'next/font/google'
import type { Metadata, Viewport } from 'next'
import './globals.css'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
})

/** Body and UI text — Inter is built for screens and small sizes. */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'CareNest | Book doctors, video consults & lab tests in India',
  description:
    'Find verified doctors near you, book clinic visits or video consults, and get lab tests done at home — with cashless and Ayushman Bharat support.',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#16265e' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0a1a' },
  ],
  userScalable: true,
}

/**
 * Runs before first paint so the correct theme class is on <html> already.
 * Without this the page renders light, then snaps to dark on hydration.
 */
const themeBootScript = `
(function () {
  try {
    var stored = localStorage.getItem('carenest-theme');
    var dark = stored
      ? stored === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className={`${inter.variable} ${jakarta.variable} font-sans`}>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
