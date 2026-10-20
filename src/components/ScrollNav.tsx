import { useEffect, useState } from 'react'
import { ArrowUp, ArrowDown } from './ui.js'
import type { ReactNode } from 'react'

// Ends of a long page.
//
// The editor isn't a fixed-height box with its own scrollbar, which would make
// it feel like a letterbox. That means a long docs page is a long page, and the
// two things you want from the middle of one are both at an end: the toolbar
// and the page name at the top, Continue at the foot.
//
// Neither arrow appears unless it would do something. Nothing shows at all on a
// page short enough to take in at a glance, so ordinary steps — the picker, the
// form — never grow a control they have no use for.

/** Below this the page is short enough that the ends are already in reach. */
const LONG_ENOUGH = 1.6
/** How far from an end before that arrow stops being worth offering. */
const SLACK = 320

export default function ScrollNav() {
  const [{ up, down }, setShow] = useState({ up: false, down: false })

  useEffect(() => {
    const check = () => {
      const doc = document.documentElement
      const y = window.scrollY
      const vh = window.innerHeight
      const h = doc.scrollHeight
      const long = h > vh * LONG_ENOUGH
      setShow({
        up: long && y > SLACK,
        down: long && y + vh < h - SLACK,
      })
    }

    check()
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    // Switching page or opening a locked block changes the height without
    // anyone scrolling, and a stale arrow that scrolls nowhere is worse than
    // no arrow.
    const ro = new ResizeObserver(check)
    ro.observe(document.body)

    return () => {
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
      ro.disconnect()
    }
  }, [])

  if (!up && !down) return null

  const go = (top: number) =>
    window.scrollTo({
      top,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    })

  return (
    // Anchored to the column, not to the window. Pinned to the viewport's
    // corner they'd sit some 800px from a centred editor on a large monitor,
    // far outside where anyone is looking while they write. Tracking the
    // shell's own width puts them just past the edge of the page you're reading
    // at any size, and on a narrow screen the shell *is* the window, so they
    // land in the corner.
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 px-4 print:hidden">
      <div className="mx-auto flex max-w-6xl justify-end">
        <div className="pointer-events-auto flex flex-col gap-1.5">
          {up && (
            <Arrow label="Back to the top" onClick={() => go(0)}>
              <ArrowUp />
            </Arrow>
          )}
          {down && (
            <Arrow
              label="Jump to the foot of the page"
              onClick={() => go(document.documentElement.scrollHeight)}
            >
              <ArrowDown />
            </Arrow>
          )}
        </div>
      </div>
    </div>
  )
}

function Arrow({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      // `fw-surface` against `fw-app-bg` is a few points of luminance apart, so
      // at rest these read as smudges. The brand-tinted border and a real
      // shadow are what separate them from the page behind.
      className="flex h-9 w-9 items-center justify-center rounded-full border border-brand/30 bg-fw-surface text-fw-muted shadow-lg backdrop-blur transition-colors hover:border-brand hover:bg-fw-surface-2 hover:text-fw-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
    >
      {children}
    </button>
  )
}
