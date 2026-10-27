import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import type { Role } from '@hdp/rules'
import { useAuth } from '../auth'
import { pendingCount, syncAll } from '../submit'
import { useI18n, type CopyKey } from '../i18n'
import { BrandLogos } from './BrandLogos'
import { Button, Icon, type IconName } from './ui'

const NAV: Record<Role, Array<{ to: string; key: CopyKey }>> = {
  dp_focal: [
    { to: '/scan', key: 'scan' },
    { to: '/manual', key: 'manual' },
    { to: '/dashboard', key: 'dashboard' },
  ],
  meal: [
    { to: '/register', key: 'register' },
    { to: '/cards', key: 'cards' },
    { to: '/export', key: 'export' },
  ],
  supervisor: [
    { to: '/scan', key: 'scan' },
    { to: '/reconcile', key: 'reconcile' },
    { to: '/export', key: 'export' },
  ],
  admin: [
    { to: '/register', key: 'register' },
    { to: '/cards', key: 'cards' },
    { to: '/admin', key: 'admin' },
  ],
}

const ICONS: Partial<Record<CopyKey, IconName>> = {
  scan: 'scan',
  manual: 'manual',
  dashboard: 'dashboard',
  register: 'register',
  cards: 'cards',
  export: 'export',
  reconcile: 'reconcile',
  admin: 'admin',
}

export function Shell() {
  const { session, signOut } = useAuth()
  const { t, locale, setLocale } = useI18n()
  const navigate = useNavigate()
  const [pending, setPending] = useState(0)
  const [online, setOnline] = useState(navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const role = session?.user.role ?? 'dp_focal'

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

  return (
    <div className="h-dvh bg-paper">
      <div className="mx-auto flex h-dvh w-full max-w-3xl flex-col bg-canvas shadow-[0_0_48px_rgba(12,40,48,0.16)]">
        <header className="no-print sticky top-0 z-20 bg-teal text-white">
          <button className="flex w-full items-center justify-center bg-white px-4 py-2" onClick={() => navigate('/')} aria-label={t('appName')}>
            <BrandLogos className="h-12" />
          </button>
          <div className="px-4 pt-3">
            <button className="w-full text-start" onClick={() => navigate('/')}>
              <span className="block truncate text-lg font-bold leading-tight">{t('appName')}</span>
              <span className="block truncate text-xs text-white/75">{t('appPlace')}</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-4 pb-3 text-sm">
            <span className={`rounded-full px-3 py-1 font-semibold ${online ? 'bg-white/15' : 'bg-warn text-white'}`}>
              {online ? t('online') : t('offline')}
            </span>
            <span className="rounded-full bg-white/15 px-3 py-1" data-testid="pending-count">
              {t('pending')}: {pending}
            </span>
            <button
              className="min-h-10 rounded-full bg-white/15 px-3 font-bold"
              onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}
            >
              {locale === 'en' ? 'عربي' : 'EN'}
            </button>
            <Button
              size="sm"
              tone="sand"
              disabled={syncing}
              onClick={() => {
                setSyncing(true)
                void syncAll().finally(() => setSyncing(false))
              }}
            >
              {syncing ? t('syncing') : t('syncNow')}
            </Button>
            <button
              className="min-h-10 rounded-full px-3 font-semibold text-white/90 underline-offset-2 hover:underline"
              onClick={() => void signOut().then(() => navigate('/login'))}
            >
              {t('logout')}
            </button>
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
          <Outlet />
        </main>
        <nav className="no-print z-20 border-t border-line bg-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-3 gap-1">
            {NAV[role].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-center text-sm font-bold ${isActive ? 'bg-mist text-teal' : 'text-muted hover:bg-mist hover:text-ink'}`
                }
              >
                {ICONS[item.key] ? <Icon name={ICONS[item.key]!} /> : null}
                {t(item.key)}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
