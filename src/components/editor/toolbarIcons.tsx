import type { IconProps } from '../ui.js'

const ico = {
  viewBox: '0 0 24 24',
  width: 16,
  height: 16,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export const BoldIcon = (p: IconProps) => (
  <svg {...ico} {...p}>
    <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />
  </svg>
)
export const ItalicIcon = (p: IconProps) => (
  <svg {...ico} {...p}>
    <path d="M15 5h-5M14 19H9M14.5 5l-4 14" />
  </svg>
)
export const LinkIcon = (p: IconProps) => (
  <svg {...ico} {...p}>
    <path d="M10 13a4 4 0 0 0 5.7.3l3-3A4 4 0 0 0 13 4.7l-1.7 1.7" />
    <path d="M14 11a4 4 0 0 0-5.7-.3l-3 3A4 4 0 0 0 11 19.3l1.7-1.7" />
  </svg>
)
export const ListIcon = (p: IconProps) => (
  <svg {...ico} {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none" />
  </svg>
)
export const OrderedListIcon = (p: IconProps) => (
  <svg {...ico} {...p}>
    <path d="M10 6h10M10 12h10M10 18h10" />
    <path d="M4 5.5h1V9M3.6 15c0-.8 1.4-.8 1.4 0s-1.4 1.2-1.4 2.2H5" strokeWidth="1.4" />
  </svg>
)
export const QuoteIcon = (p: IconProps) => (
  <svg {...ico} {...p}>
    <path d="M5 5v14" strokeWidth="2.5" />
    <path d="M10 8h9M10 12h9M10 16h6" />
  </svg>
)
