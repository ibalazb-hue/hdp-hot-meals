import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import type { Role } from '@hdp/rules'

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
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19c1-3 3-4.5 6-4.5S17 16 18 19" />
      <circle cx="17" cy="8" r="2.2" />
    </>
  ),
  meal: (
    <>
      <path d="M4 11h16v2H4z" />
      <path d="M6 11V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3" />
      <path d="M8 15h8v3H8z" />
    </>
  ),
} as const

export type IconName = keyof typeof ICONS

export function Icon({ name, className = 'size-6' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

export function Button({
  children,
  tone = 'teal',
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'teal' | 'sand' | 'blocked' | 'served' | 'ghost'; size?: 'md' | 'sm' | 'lg' }) {
  const tones = {
    teal: 'bg-teal text-white hover:bg-lagoon shadow-sm',
    sand: 'border border-line bg-white text-ink hover:bg-mist',
    blocked: 'bg-blocked text-white',
    served: 'bg-served text-white',
    ghost: 'bg-white/15 text-white hover:bg-white/25',
  }
  const sizes = {
    sm: 'min-h-10 rounded-lg px-3 text-sm',
    md: 'min-h-12 rounded-xl px-4 text-base',
    lg: 'min-h-14 rounded-2xl px-5 text-base',
  }
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition disabled:opacity-50 ${tones[tone]} ${sizes[size]} ${props.className ?? ''}`}
    >
      {children}
    </button>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs leading-snug text-muted">{hint}</span> : null}
    </label>
  )
}

export const controlClass =
  'min-h-12 w-full rounded-xl border border-line bg-white px-4 text-base shadow-sm transition focus:border-lagoon focus:ring-2 focus:ring-lagoon/20'

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controlClass} ${props.className ?? ''}`} />
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${controlClass} ${props.className ?? ''}`} />
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)] sm:p-5 ${className}`}>{children}</section>
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm leading-snug text-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'ok' | 'warn' | 'danger'; children: ReactNode }) {
  const tones = {
    info: 'border-lagoon/25 bg-mist text-teal',
    ok: 'border-served/25 bg-served/10 text-served',
    warn: 'border-amber/30 bg-amber/10 text-warn',
    danger: 'border-blocked/25 bg-blocked/10 text-blocked',
  }
  return <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold leading-snug ${tones[tone]}`}>{children}</div>
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-mist/60 px-4 py-10 text-center">
      <p className="font-bold text-ink">{title}</p>
      {body ? <p className="mt-1 text-sm text-muted">{body}</p> : null}
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'default' | 'ok' | 'danger' | 'warn' | 'teal'
}) {
  const tones = {
    default: 'text-ink',
    ok: 'text-served',
    danger: 'text-blocked',
    warn: 'text-warn',
    teal: 'text-teal',
  }
  return (
    <Panel className="min-w-0">
      <p className={`tabular text-3xl font-bold tracking-tight sm:text-4xl ${tones[tone]}`}>{value}</p>
      <p className="mt-1 text-sm font-semibold text-muted">{label}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Panel>
  )
}

const ROLE_TONE: Record<Role, string> = {
  admin: 'bg-teal text-white',
  supervisor: 'bg-lagoon text-white',
  meal: 'bg-served text-white',
  dp_focal: 'bg-sky text-white',
}

export function RoleBadge({ role, label }: { role: Role | string; label: string }) {
  const tone = ROLE_TONE[role as Role] ?? 'bg-mist text-ink'
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide ${tone}`}>{label}</span>
}

export function StatusPill({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${on ? 'bg-served/15 text-served' : 'bg-blocked/10 text-blocked'}`}>
      {on ? onLabel : offLabel}
    </span>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string }>
}) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-mist p-1">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`min-h-11 shrink-0 rounded-xl px-3 text-sm font-bold transition ${active ? 'bg-white text-teal shadow-sm' : 'text-muted hover:text-ink'}`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function ProgressBar({ ratio, alert }: { ratio: number | null; alert?: boolean }) {
  const pct = ratio == null ? 0 : Math.max(0, Math.min(100, Math.round(ratio * 100)))
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-mist">
      <div
        className={`h-full rounded-full transition-all ${alert ? 'bg-blocked' : pct >= 99 ? 'bg-served' : 'bg-lagoon'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
