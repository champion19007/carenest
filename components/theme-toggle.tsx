'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'carenest-theme'

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

const options: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
]

export function ThemeToggle({
  compact = false,
  onBanner = false,
}: {
  compact?: boolean
  /** Sits on the navy/violet brand strip, so it inherits that foreground. */
  onBanner?: boolean
}) {
  const [theme, setTheme] = useState<Theme>('light')
  const [isDark, setIsDark] = useState(false)
  /* Until the stored preference is read, render the neutral state so the
     server HTML and the first client render agree. */
  const [ready, setReady] = useState(false)
  /** Guards against overlapping view transitions, which reject. */
  const transitioning = useRef(false)

  const sync = useCallback((next: Theme, animate = false) => {
    const dark = next === 'dark'
    const swap = () => {
      document.documentElement.classList.toggle('dark', dark)
      setIsDark(dark)
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const canAnimate =
      animate &&
      !reduced &&
      !transitioning.current &&
      document.visibilityState === 'visible' &&
      'startViewTransition' in document

    if (!canAnimate) {
      swap()
      return
    }

    /* One composited cross-fade of the whole page, instead of thousands of
       independently transitioning elements. A transition started while
       another is in flight (or on a hidden tab) rejects, so guard and
       swallow — the class swap itself has already happened either way. */
    transitioning.current = true
    const transition = (
      document as Document & {
        startViewTransition: (cb: () => void) => {
          ready: Promise<void>
          finished: Promise<void>
          updateCallbackDone: Promise<void>
        }
      }
    ).startViewTransition(swap)

    /* All three promises reject when a transition is skipped or interrupted.
       Any one left unhandled surfaces as an uncaught AbortError, so swallow
       each — the DOM swap itself has already happened regardless. */
    transition.ready.catch(() => {})
    transition.updateCallbackDone.catch(() => {})
    transition.finished
      .catch(() => {})
      .finally(() => {
        transitioning.current = false
      })
  }, [])

  useEffect(() => {
    /* Fall back to the OS preference once, then the choice is explicit. */
    const stored =
      (localStorage.getItem(STORAGE_KEY) as Theme | null) ??
      (systemPrefersDark() ? 'dark' : 'light')
    setTheme(stored)
    sync(stored)
    setReady(true)
    /* Enable colour transitions only after first paint, so the page doesn't
       visibly fade in from the wrong theme on load. */
    document.documentElement.classList.add('theme-ready')
  }, [sync])

  useEffect(() => {
    if (!ready) return
    localStorage.setItem(STORAGE_KEY, theme)
    /* `ready` is already true here, so this only ever runs on a user choice —
       safe to animate. */
    sync(theme, true)
  }, [theme, ready, sync])

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        className="inline-flex size-11 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted"
      >
        {isDark ? <Moon className="size-5" /> : <Sun className="size-5" />}
      </button>
    )
  }

  /* On the brand strip the control is a segmented pill in the banner's own
     foreground colour, so it reads on navy and on deep violet alike. */
  const shellClass = onBanner
    ? 'border-banner-foreground/25 bg-banner-foreground/10'
    : 'border-border bg-card'

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`inline-flex items-center gap-0.5 rounded-full border p-0.5 ${shellClass}`}
    >
      {options.map(({ value, label, Icon }) => {
        const selected = ready && theme === value
        const selectedClass = onBanner
          ? 'bg-banner-foreground text-banner'
          : 'bg-cta text-cta-foreground'
        const idleClass = onBanner
          ? 'text-banner-foreground/70 hover:text-banner-foreground'
          : 'text-muted-foreground hover:bg-muted'

        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${label} theme`}
            title={`${label} theme`}
            onClick={() => setTheme(value)}
            className={`inline-flex size-8 items-center justify-center rounded-full transition-colors ${
              selected ? selectedClass : idleClass
            }`}
          >
            <Icon className="size-4" />
          </button>
        )
      })}
    </div>
  )
}
