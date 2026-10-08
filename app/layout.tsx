import { Inter, Plus_Jakarta_Sans } from 'next/font/google'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { MobileNavigation } from '@/components/mobile-navigation'

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
  title: 'CareNest | Find doctors and care for your family',
  description:
    'Explore doctors, compare consultation fees, book appointments, and discover veterinary care for your pets.',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e8f3ff' },
    { media: '(prefers-color-scheme: dark)', color: '#0c1525' },
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
    <html lang="en-IN" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className={`${inter.variable} ${jakarta.variable} font-sans`}>
        {children}
        <MobileNavigation />
      </body>
    </html>
  )
}
