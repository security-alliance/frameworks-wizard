import { useEffect, useId, useRef, useState } from 'react'
import type { FocusEvent, ReactElement, ReactNode } from 'react'

// A toolbar control's name and how else to do it: "Bulleted list / Type - and
// a space, or ⌘⇧8". The shortcuts are nice to know rather than needed, which
// is what a tooltip is for, and each control teaches its own.
//
// Not the native `title`: that shows only after a long delay, never on keyboard
// focus, and can't be styled. This one follows WCAG 1.4.13: it appears on
// hover after a moment and at once on keyboard focus, Esc dismisses it, the
// pointer can move onto it without it vanishing, and it stays until pointer or
// focus leaves. A light surface on the dark theme (and the reverse on the light
// one) reads as a layer of its own.

export interface TooltipTriggerProps {
  'aria-describedby': string
  onMouseEnter: () => void
  onMouseLeave: () => void
  onFocus: (e: FocusEvent<HTMLElement>) => void
  onBlur: () => void
}

const SHOW_AFTER_MS = 400
// Long enough to cross the gap from the button onto the tooltip.
const HIDE_AFTER_MS = 120

export default function Tooltip({
  name,
  hint,
  off = false,
  children,
}: {
  name: string
  hint?: ReactNode
  /** Kept quiet, e.g. while the control's own panel is open below it. */
  off?: boolean
  children: (trigger: TooltipTriggerProps) => ReactElement
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  const show = (now = false) => {
    cancel()
    if (now) setOpen(true)
    else timer.current = setTimeout(() => setOpen(true), SHOW_AFTER_MS)
  }
  const hide = (now = false) => {
    cancel()
    if (now) setOpen(false)
    else timer.current = setTimeout(() => setOpen(false), HIDE_AFTER_MS)
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  // Esc hides it without moving focus, and without also leaving focus mode,
  // which Esc does elsewhere.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      hide(true)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const visible = open && !off

  return (
    <span className="relative inline-flex">
      {children({
        'aria-describedby': id,
        onMouseEnter: () => show(),
        onMouseLeave: () => hide(),
        // Only keyboard focus: the toolbar's buttons don't take focus on a
        // click, and a tooltip popping up on every click would be noise.
        onFocus: (e) => e.currentTarget.matches(':focus-visible') && show(true),
        onBlur: () => hide(true),
      })}
      {/* In the page while hidden too, so the button's description is there
          for a screen reader whether or not it's showing. */}
      <span
        id={id}
        role="tooltip"
        onMouseEnter={() => show(true)}
        onMouseLeave={() => hide()}
        className={`absolute left-1/2 top-full z-40 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-fw-text px-2.5 py-1.5 text-left text-[0.75rem] leading-snug text-fw-bg shadow-lg ${
          visible ? '' : 'hidden'
        }`}
      >
        <span
          aria-hidden
          className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-fw-text"
        />
        <span className="block font-semibold">{name}</span>
        {hint && <span className="block opacity-80">{hint}</span>}
      </span>
    </span>
  )
}

/** What to type, inside a tooltip. */
export function Keys({ children }: { children: ReactNode }) {
  return <code className="rounded bg-fw-bg/15 px-1 font-mono text-[0.6875rem]">{children}</code>
}
