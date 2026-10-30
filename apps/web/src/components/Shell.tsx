import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import type { Role } from '@hdp/rules'
import { useAuth } from '../auth'
import { pendingCount, syncAll } from '../submit'
import { useI18n, type CopyKey } from '../i18n'
import { BrandLogos } from './BrandLogos'
import { Button, Icon, RoleBadge, type IconName } from './ui'

const NAV: Record<Role, Array<{ to: string; key: CopyKey }>> = {
  dp_focal: [
    { to: '/scan', key: 'scan' },
    { to: '/manual', key: 'manual' },
    { to: '/dashboard', key: 'dashboard' },
  ],
  meal: [
    { to: '/dashboard', key: 'dashboard' },
    { to: '/reports', key: 'reports' },
    { to: '/followup', key: 'followup' },
    { to: '/register', key: 'register' },
    { to: '/reconcile', key: 'reconcile' },
    { to: '/cards', key: 'cards' },
  ],
  supervisor: [
    { to: '/scan', key: 'scan' },
    { to: '/dashboard', key: 'dashboard' },
    { to: '/reports', key: 'reports' },
    { to: '/followup', key: 'followup' },
    { to: '/reconcile', key: 'reconcile' },
    { to: '/export', key: 'export' },
  ],
  admin: [
    { to: '/dashboard', key: 'dashboard' },
    { to: '/reports', key: 'reports' },
    { to: '/followup', key: 'followup' },
    { to: '/reconcile', key: 'reconcile' },
    { to: '/admin', key: 'admin' },
    { to: '/register', key: 'register' },
  ],
}

const ROLE_LABEL: Record<Role, CopyKey> = {
  dp_focal: 'roleDpFocal',
  meal: 'roleMeal',
  supervisor: 'roleSupervisor',
  admin: 'roleAdmin',
}

const ICONS: Partial<Record<CopyKey, IconName>> = {
  scan: 'scan',
  manual: 'manual',
  dashboard: 'dashboard',
  reports: 'reconcile',
  followup: 'dashboard',
  register: 'register',
  cards: 'cards',
  export: 'export',
  reconcile: 'reconcile',
  admin: 'admin',
}

const WIDE: Role[] = ['admin', 'meal', 'supervisor']

export function Shell() {
  const { session, signOut } = useAuth()
  const { t, locale, setLocale } = useI18n()
  const navigate = useNavigate()
  const [pending, setPending] = useState(0)
  const [online, setOnline] = useState(navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const role = session?.user.role ?? 'dp_focal'
  const wide = WIDE.includes(role)

  useEffect(() => {
    const refresh = () => {
      setOnline(navigator.onLine)
      void pendingCount().then(setPending)
    }
    refresh()
    const timer = window.setInterval(refresh, 4000)
    window.addEventListener('online', refresh)
    window.addEventListener('offline', refresh)
    window.addEventListener('hdp-sync', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('online', refresh)
      window.removeEventListener('offline', refresh)
      window.removeEventListener('hdp-sync', refresh)
    }
  }, [])

  const cols = NAV[role].length >= 4 ? 'grid-cols-4' : 'grid-cols-3'

  return (
    <div className="h-dvh bg-paper">
      <div
        className={`mx-auto flex h-dvh w-full flex-col bg-canvas shadow-[var(--shadow-lift)] ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}
      >
        <header className="no-print sticky top-0 z-20 bg-teal text-white">
          <button
            className="flex w-full items-center justify-center bg-white px-4 py-1.5 sm:py-2.5"
            onClick={() => navigate('/')}
            aria-label={t('appName')}
          >
            <BrandLogos className="h-8 sm:h-12" />
          </button>
          <div className="flex items-start justify-between gap-3 px-4 pt-2 sm:pt-3">
            <button className="min-w-0 flex-1 text-start" onClick={() => navigate('/')}>
              <span className="block truncate text-[13px] font-bold leading-snug sm:whitespace-normal sm:text-base">{t('appName')}</span>
              <span className="hidden truncate text-xs text-white/70 sm:block">{t('appPlace')}</span>
            </button>
            <RoleBadge role={role} label={t(ROLE_LABEL[role])} />
          </div>
          <div className="nav-scroll flex items-center gap-1.5 overflow-x-auto whitespace-nowrap px-4 pt-1.5 pb-2.5 text-sm sm:flex-wrap sm:gap-2 sm:overflow-visible sm:py-3">
            <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold sm:px-3 sm:py-1.5 sm:text-xs ${online ? 'bg-white/15' : 'bg-warn text-white'}`}>
              <span className={`size-1.5 rounded-full ${online ? 'bg-emerald-300' : 'bg-white'}`} aria-hidden="true" />
              {online ? t('online') : t('offline')}
            </span>
            <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold sm:px-3 sm:py-1.5 sm:text-xs" data-testid="pending-count">
              {t('pending')}: {pending}
            </span>
            <button
              className="min-h-8 shrink-0 rounded-full bg-white/15 px-3 text-[11px] font-bold sm:min-h-10 sm:text-xs"
              onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}
            >
              {locale === 'en' ? 'عربي' : 'EN'}
            </button>
            <Button
              size="sm"
              tone="ghost"
              className="!min-h-8 shrink-0 !px-3 !text-[11px] sm:!min-h-10 sm:!text-xs"
              disabled={syncing}
              onClick={() => {
                setSyncing(true)
                void syncAll().finally(() => setSyncing(false))
              }}
            >
              {syncing ? t('syncing') : t('syncNow')}
            </Button>
            <button
              className="ms-auto min-h-8 shrink-0 rounded-full px-2 text-[11px] font-semibold text-white/80 underline-offset-2 hover:underline sm:min-h-10 sm:px-3 sm:text-xs"
              onClick={() => void signOut().then(() => navigate('/login'))}
            >
              {t('logout')}
            </button>
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5 pt-3 pb-4 sm:px-5 sm:py-4">
          <Outlet />
        </main>
        <nav className="no-print z-20 border-t border-line bg-white/95 px-1.5 pt-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className={`nav-scroll flex snap-x snap-mandatory gap-1 overflow-x-auto sm:grid sm:overflow-visible ${cols}`}>
            {NAV[role].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex min-h-[3.25rem] min-w-[4.75rem] flex-1 shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-xl px-2 text-center text-[11px] font-semibold leading-none sm:min-h-14 sm:min-w-0 sm:text-xs ${
                    isActive ? 'bg-mist text-teal' : 'text-muted hover:bg-mist hover:text-ink'
                  }`
                }
              >
                {ICONS[item.key] ? <Icon name={ICONS[item.key]!} className="size-5" /> : null}
                <span className="whitespace-nowrap">{t(item.key)}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
