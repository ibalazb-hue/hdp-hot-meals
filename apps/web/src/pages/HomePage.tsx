import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adenDate, type Role } from '@hdp/rules'
import { useAuth } from '../auth'
import { db } from '../db'
import { bundleAge } from '../submit'
import { useI18n, type CopyKey } from '../i18n'
import { Icon, type IconName } from '../components/ui'

const LINKS: Record<Role, CopyKey[]> = {
  dp_focal: ['scan', 'manual', 'dashboard', 'sop'],
  meal: ['register', 'cards', 'dashboard', 'reconcile', 'export', 'sop'],
  supervisor: ['scan', 'manual', 'dashboard', 'reconcile', 'export', 'sop'],
  admin: ['register', 'cards', 'admin', 'dashboard', 'reconcile', 'export', 'sop'],
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
      <section className="overflow-hidden rounded-2xl bg-teal text-white shadow-sm">
        <div className="px-5 py-4">
          <p className="text-sm text-white/75">{session ? t(ROLE_LABEL[session.user.role]) : ''}</p>
          {session?.user.role === 'supervisor' ? null : <h1 className="text-2xl font-bold">{session?.user.displayName}</h1>}
          <p className="mt-1 text-sm text-white/80">{t('oneMeal')}</p>
        </div>
        <div className="grid grid-cols-2 border-t border-white/15">
          <div className="px-5 py-4">
            <p className="text-4xl font-bold tabular-nums" data-testid="home-served">
              {served}
            </p>
            <p className="text-sm text-white/75">{t('servedToday')}</p>
          </div>
          <div className="border-s border-white/15 px-5 py-4 text-sm text-white/80">
            {updated ? `${t('lastSync')}: ${new Date(updated).toLocaleString()}` : t('neverSynced')}
          </div>
        </div>
      </section>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {LINKS[role].map((key) => (
          <Link
            key={key}
            to={PATH[key] ?? '/'}
            className="flex min-h-28 flex-col justify-between rounded-2xl border border-line bg-white p-4 text-start shadow-sm hover:border-lagoon"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-mist text-teal">
              {icons[key] ? <Icon name={icons[key]} /> : null}
            </span>
            <span className="text-base font-bold">{t(key)}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
