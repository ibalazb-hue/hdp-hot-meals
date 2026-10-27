import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adenDate, type Role } from '@hdp/rules'
import { useAuth } from '../auth'
import { db } from '../db'
import { bundleAge } from '../submit'
import { useI18n, type CopyKey } from '../i18n'
import { Icon, RoleBadge, type IconName } from '../components/ui'

const LINKS: Record<Role, CopyKey[]> = {
  dp_focal: ['scan', 'manual', 'dashboard', 'sop'],
  meal: ['dashboard', 'register', 'reconcile', 'cards', 'export', 'sop'],
  supervisor: ['scan', 'manual', 'dashboard', 'reconcile', 'export', 'sop'],
  admin: ['dashboard', 'reconcile', 'admin', 'register', 'cards', 'export', 'sop'],
}

const ROLE_LABEL: Record<Role, CopyKey> = {
  dp_focal: 'roleDpFocal',
  meal: 'roleMeal',
  supervisor: 'roleSupervisor',
  admin: 'roleAdmin',
}

const PATH: Partial<Record<CopyKey, string>> = {
  scan: '/scan',
  manual: '/manual',
  dashboard: '/dashboard',
  register: '/register',
  cards: '/cards',
  reconcile: '/reconcile',
  export: '/export',
  admin: '/admin',
  sop: '/sop',
}

const DESC: Partial<Record<CopyKey, CopyKey>> = {
  scan: 'tileScan',
  manual: 'tileManual',
  dashboard: 'tileDashboard',
  register: 'tileRegister',
  cards: 'tileCards',
  reconcile: 'tileReconcile',
  export: 'tileExport',
  admin: 'tileAdmin',
  sop: 'tileSop',
}

export function HomePage() {
  const { session } = useAuth()
  const { t } = useI18n()
  const [served, setServed] = useState(0)
  const [updated, setUpdated] = useState<string | null>(null)
  const role = session?.user.role ?? 'dp_focal'

  useEffect(() => {
    const date = adenDate()
    void db.scans.where('scanDate').equals(date).and((scan) => scan.countsAsDistributed).count().then(setServed)
    void bundleAge().then(setUpdated)
  }, [])

  const icons: Partial<Record<CopyKey, IconName>> = {
    scan: 'scan',
    manual: 'manual',
    dashboard: 'dashboard',
    register: 'register',
    cards: 'cards',
    reconcile: 'reconcile',
    export: 'export',
    admin: 'admin',
    sop: 'sop',
  }

  return (
    <div className="grid gap-4">
      <section className="overflow-hidden rounded-3xl bg-teal text-white shadow-[var(--shadow-lift)]">
        <div className="px-5 py-5">
          <div className="mb-2">
            <RoleBadge role={role} label={session ? t(ROLE_LABEL[session.user.role]) : ''} />
          </div>
          {session?.user.role === 'supervisor' ? (
            <h1 className="text-2xl font-bold tracking-tight">{t('roleSupervisor')}</h1>
          ) : (
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{session?.user.displayName}</h1>
          )}
          <p className="mt-1 text-sm text-white/75">{t('oneMeal')}</p>
        </div>
        <div className="grid grid-cols-2 border-t border-white/15 bg-black/10">
          <div className="px-5 py-4">
            <p className="tabular text-4xl font-bold" data-testid="home-served">
              {served}
            </p>
            <p className="text-sm text-white/75">{t('servedToday')}</p>
          </div>
          <div className="border-s border-white/15 px-5 py-4 text-sm text-white/80">
            <p className="font-semibold text-white/90">{t('lastSync')}</p>
            <p className="mt-1 leading-snug">{updated ? new Date(updated).toLocaleString() : t('neverSynced')}</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {LINKS[role].map((key) => (
          <Link
            key={key}
            to={PATH[key] ?? '/'}
            className="group flex min-h-32 flex-col justify-between rounded-2xl border border-line bg-white p-4 text-start shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-lagoon hover:shadow-[var(--shadow-lift)]"
          >
            <span className="grid size-11 place-items-center rounded-2xl bg-mist text-teal transition group-hover:bg-teal group-hover:text-white">
              {icons[key] ? <Icon name={icons[key]!} /> : null}
            </span>
            <span>
              <span className="block text-base font-bold leading-tight">{t(key)}</span>
              {DESC[key] ? <span className="mt-1 block text-xs leading-snug text-muted">{t(DESC[key]!)}</span> : null}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
