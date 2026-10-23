// Small shared UI primitives, themed to the Frameworks violet/dark palette.

import { useEffect, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode, SVGProps } from 'react'

/**
 * Chrome that folds away instead of vanishing.
 *
 * Focus mode hides the brand bar, the stepper and the step controls at once.
 * Unmounting them would make the page jump, with the editor arriving somewhere
 * it hadn't visibly moved to. Animating the row height means the space is seen
 * to be given up, which is what makes the editor growing into it read as one
 * movement rather than two unrelated ones.
 *
 * `grid-template-rows: 1fr → 0fr` is the trick that animates to a height nobody
 * has to measure. The clip is timed rather than permanent because the brand bar
 * contains a dropdown that hangs outside its own box — clipping forever would
 * cut the account menu in half — and it's a timeout rather than `transitionend`
 * so it still resolves when the OS has asked for no motion and no transition
 * ever fires.
 */
export function Collapse({
  open,
  children,
}: {
  open: boolean
  children: ReactNode
}) {
  const [clip, setClip] = useState(!open)

  useEffect(() => {
    if (!open) {
      setClip(true)
      return
    }
    const t = setTimeout(() => setClip(false), 320)
    return () => clearTimeout(t)
  }, [open])

  return (
    <div
      inert={!open}
      aria-hidden={!open}
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className={clip ? 'overflow-hidden' : ''}>{children}</div>
    </div>
  )
}

type ButtonVariant = 'primary' | 'ghost' | 'outline'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const styles: Record<ButtonVariant, string> = {
    primary:
      'bg-brand text-white hover:bg-brand-hover shadow-[0_0_0_1px_rgba(139,92,246,0.4)] disabled:opacity-40 disabled:hover:bg-brand',
    ghost:
      'text-fw-muted hover:text-fw-text hover:bg-fw-surface-2 disabled:opacity-40',
    outline:
      'border border-fw-border text-fw-text hover:border-brand hover:text-fw-strong disabled:opacity-40',
  }
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${styles[variant]} ${className}`}
      {...props}
    />
  )
}

export function Card({
  className = '',
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={`fw-card-shadow rounded-2xl border border-fw-border bg-fw-surface/80 backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  )
}

/* ---- inline icons (no icon dependency) ---- */

export type IconProps = SVGProps<SVGSVGElement>

const ico = {
  viewBox: '0 0 24 24',
  width: 18,
  height: 18,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

// The larger icons used on the landing page and the step cards.
const big = { ...ico, width: 22, height: 22 } as const

export const SearchIcon = (p: IconProps) => (
  <svg {...ico} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
)
export const SunIcon = (p: IconProps) => (
  <svg {...ico} {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
)
export const MoonIcon = (p: IconProps) => (
  <svg {...ico} {...p}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
)
export const ChevronDown = (p: IconProps) => (
  <svg {...ico} width="14" height="14" {...p}>
    <path d="M6 9l6 6 6-6" />
  </svg>
)
export const SignOutIcon = (p: IconProps) => (
  <svg {...ico} {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </svg>
)
export const ExternalIcon = (p: IconProps) => (
  <svg {...ico} {...p}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <path d="M15 3h6v6M10 14L21 3" />
  </svg>
)
export const PencilIcon = (p: IconProps) => (
  <svg {...ico} {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
)
export const LockSmallIcon = (p: IconProps) => (
  <svg {...ico} width="14" height="14" {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
)
// Enter / leave focus mode. Corner brackets opening outwards, then closing back
// in — the fullscreen metaphor, which is what the mode actually is: the page
// minus everything that isn't the page.
export const FocusIcon = (p: IconProps) => (
  <svg {...ico} width="15" height="15" {...p}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
  </svg>
)
export const ExitFocusIcon = (p: IconProps) => (
  <svg {...ico} width="15" height="15" {...p}>
    <path d="M3 8h3a2 2 0 0 0 2-2V3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M21 16h-3a2 2 0 0 0-2 2v3" />
  </svg>
)
// Jump to the top / foot of a long document.
export const ArrowUp = (p: IconProps) => (
  <svg {...ico} width="16" height="16" strokeWidth="2" {...p}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
)
export const ArrowDown = (p: IconProps) => (
  <svg {...ico} width="16" height="16" strokeWidth="2" {...p}>
    <path d="M12 5v14M5 12l7 7 7-7" />
  </svg>
)
export const PlusIcon = (p: IconProps) => (
  <svg {...ico} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
export const TrashIcon = (p: IconProps) => (
  <svg {...ico} width="15" height="15" {...p}>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
  </svg>
)

export const ShieldIcon = (p: IconProps) => (
  <svg {...big} {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
  </svg>
)
export const UsersIcon = (p: IconProps) => (
  <svg {...big} {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" />
  </svg>
)
export const BookIcon = (p: IconProps) => (
  <svg {...big} {...p}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
)
export const BranchIcon = (p: IconProps) => (
  <svg {...big} {...p}>
    <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="9" r="3" />
    <path d="M6 9v6M18 12a9 9 0 0 1-9 9" />
  </svg>
)
export const CheckIcon = (p: IconProps) => (
  <svg {...ico} width="16" height="16" strokeWidth="3" {...p}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
)
export const ArrowRight = (p: IconProps) => (
  <svg {...ico} width="16" height="16" strokeWidth="2" {...p}>
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)
export const ArrowLeft = (p: IconProps) => (
  <svg {...ico} width="16" height="16" strokeWidth="2" {...p}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
)
