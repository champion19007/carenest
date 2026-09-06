'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

/** Expand/collapse row used by the health-concern lists. */
export function Disclosure({ label, items }: { label: string; items: string[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 py-4 text-left text-lg font-semibold"
      >
        {label}
        <ChevronDown
          className={`size-5 shrink-0 text-muted-foreground transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && (
        <ul className="flex flex-wrap gap-2 pb-4">
          {items.map((item) => (
            <li key={item}>
              <a
                href="/search"
                className="inline-block rounded-full bg-muted px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-soft hover:text-primary"
              >
                {item}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
