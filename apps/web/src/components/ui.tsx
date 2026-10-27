import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

const ICONS = {
  scan: (
    <>
      <path d="M4 8V5h3M16 5h3v3M20 16v3h-3M7 19H4v-3" />
      <path d="M8 12h8" />
    </>
  ),
  manual: (
    <>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M8 10h8M8 14h5" />
    </>
  ),
  dashboard: (
    <>
      <path d="M5 19V11M12 19V5M19 19v-6" />
    </>
  ),
  register: (
    <>
      <circle cx="12" cy="8" r="3" />
      <path d="M5 19c1.2-3 3.4-4.5 7-4.5S17.8 16 19 19" />
    </>
  ),
  cards: (
    <>
      <rect x="3" y="6" width="14" height="12" rx="2" />
      <path d="M17 9h4v10a1 1 0 0 1-1 1h-3" />
    </>
  ),
  export: (
    <>
      <path d="M12 4v10M8 10l4 4 4-4" />
      <path d="M5 19h14" />
    </>
  ),
  reconcile: (
    <>
      <path d="M12 4v16M7 8h10M6 8l-2 5h6L8 8M16 8l-2 5h6l-2-5" />
    </>
  ),
  admin: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </>
  ),
  sop: (
    <>
      <path d="M7 4h8l4 4v12H7z" />
      <path d="M15 4v4h4M9 12h6M9 16h6" />
    </>
  ),
} as const

export type IconName = keyof typeof ICONS

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

export function Button({
  children,
  tone = 'teal',
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'teal' | 'sand' | 'blocked' | 'served'; size?: 'md' | 'sm' }) {
  const tones = {
    teal: 'bg-teal text-white hover:bg-lagoon',
    sand: 'border border-line bg-white text-ink hover:bg-mist',
    blocked: 'bg-blocked text-white',
    served: 'bg-served text-white',
  }
  const sizes = {
    md: 'min-h-12 rounded-xl px-4 text-base',
    sm: 'min-h-10 rounded-lg px-3 text-sm',
  }
  return (
    <button
      {...props}
      className={`font-semibold transition disabled:opacity-50 ${tones[tone]} ${sizes[size]} ${props.className ?? ''}`}
    >
      {children}
    </button>
  )
}

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-muted">{label}</span>
      {children}
    </label>
  )
}

export const controlClass =
  'min-h-12 w-full rounded-xl border border-line bg-white px-4 text-base shadow-sm focus:border-lagoon'

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controlClass} ${props.className ?? ''}`} />
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${controlClass} ${props.className ?? ''}`} />
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-white p-4 shadow-sm ${className}`}>{children}</section>
}
