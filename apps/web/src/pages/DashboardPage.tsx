import { useEffect, useMemo, useState } from 'react'
import { adenDate } from '@hdp/rules'
import { apiJson } from '../api'
import { useAuth } from '../auth'
import { db, type LocalScan } from '../db'
import { corrections, pendingCount } from '../submit'
import { reasonLabel, useI18n } from '../i18n'
import { Alert, EmptyState, PageHeader, Panel, ProgressBar, SelectInput, StatCard, TextInput } from '../components/ui'

interface DashBody {
  uniqueServed: number
  blocked: number
  byReason: Record<string, number>
  byResult?: Record<string, number>
  dailyQuota?: number | null
  quotaRemaining?: number | null
  quotaAchievement?: number | null
}

interface ReconRow {
  dpCode: string
  nameEn: string
  nameAr: string
  mealsPrepared: number | null
  uniqueServed: number
  variance: number | null
  alert: boolean
  reason: string | null
}

export function DashboardPage() {
  const { session } = useAuth()
  const { t, locale } = useI18n()
  const role = session?.user.role ?? 'dp_focal'
  const canRecon = role === 'admin' || role === 'meal' || role === 'supervisor'
  const assigned = session?.user.dpCodes ?? []
  const [date, setDate] = useState(adenDate())
  const [dp, setDp] = useState(assigned.length === 1 ? assigned[0] : '')
  const [served, setServed] = useState(0)
  const [blocked, setBlocked] = useState(0)
  const [quota, setQuota] = useState<{ q: number; rem: number; pct: number | null } | null>(null)
  const [reasons, setReasons] = useState<Record<string, number>>({})
  const [pending, setPending] = useState(0)
  const [fixes, setFixes] = useState<LocalScan[]>([])
  const [rows, setRows] = useState<ReconRow[]>([])
  const [error, setError] = useState('')
  const [allDps, setAllDps] = useState<string[]>(assigned)

  useEffect(() => {
    void (async () => {
      setError('')
      setPending(await pendingCount())
      setFixes((await corrections()).filter((scan) => !dp || scan.dpCode === dp))
      try {
        if (canRecon) {
          const recon = await apiJson<{ rows: ReconRow[] }>(`/api/reconciliation?date=${date}`)
          setRows(recon.rows)
          setAllDps(recon.rows.map((row) => row.dpCode))
        }
        const remote = await apiJson<DashBody>(`/api/dashboard?date=${date}${dp ? `&dp=${dp}` : ''}`)
        setServed(remote.uniqueServed)
        setBlocked(remote.blocked)
        setQuota(remote.dailyQuota ? { q: remote.dailyQuota, rem: remote.quotaRemaining ?? 0, pct: remote.quotaAchievement ?? null } : null)
        setReasons(remote.byReason)
      } catch {
        const local = (await db.scans.where('scanDate').equals(date).toArray()).filter((scan) => !dp || scan.dpCode === dp)
        setServed(local.filter((scan) => scan.countsAsDistributed).length)
        setBlocked(local.filter((scan) => !scan.countsAsDistributed).length)
        const localReasons: Record<string, number> = {}
        for (const scan of local) {
          if (!scan.countsAsDistributed && scan.blockReason) localReasons[scan.blockReason] = (localReasons[scan.blockReason] ?? 0) + 1
        }
        setReasons(localReasons)
        if (canRecon) setError(t('offline'))
      }
    })()
  }, [date, dp, canRecon, t])

  const filtered = useMemo(() => (dp ? rows.filter((row) => row.dpCode === dp) : rows), [rows, dp])
  const prepared = filtered.reduce((sum, row) => sum + (row.mealsPrepared ?? 0), 0)
  const preparedKnown = filtered.some((row) => row.mealsPrepared != null)
  const reconServed = filtered.reduce((sum, row) => sum + row.uniqueServed, 0)
  const alerts = filtered.filter((row) => row.alert).length
  const missing = filtered.filter((row) => row.reason === 'missing_production').length
  const coverage = preparedKnown && prepared > 0 ? reconServed / prepared : null

  const dpOptions = allDps.length > 0 ? allDps : assigned

  return (
    <div className="grid gap-4">
      <PageHeader title={t('dashboard')} subtitle={t('dashboardSubtitle')} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-muted">{t('day')}</span>
          <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        {dpOptions.length > 0 ? (
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-muted">{t('dp')}</span>
            <SelectInput value={dp} onChange={(event) => setDp(event.target.value)}>
              {canRecon || assigned.length !== 1 ? <option value="">{t('allPoints')}</option> : null}
              {dpOptions.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </SelectInput>
          </label>
        ) : null}
      </div>

      {error ? <Alert tone="warn">{error}</Alert> : null}
      {alerts > 0 ? <Alert tone="danger">{t('alert')} ({alerts})</Alert> : null}
      {missing > 0 && alerts === 0 ? <Alert tone="warn">{t('missing')} ({missing})</Alert> : null}

      <div className={`grid gap-3 ${canRecon ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2'}`}>
        {canRecon ? (
          <StatCard label={t('mealsPrepared')} value={preparedKnown ? prepared : '—'} tone="teal" hint={t('todayPeriod')} />
        ) : null}
        <StatCard label={t('servedToday')} value={canRecon ? reconServed || served : served} tone="ok" />
        <StatCard label={t('blockedToday')} value={blocked} tone="danger" />
        {quota ? <StatCard label={t('quotaToday')} value={quota.q} tone="teal" hint={`${t('quotaRemaining')}: ${quota.rem}`} /> : null}
        {quota ? <StatCard label={t('quotaAchievement')} value={quota.pct == null ? '—' : `${Math.round(quota.pct * 100)}%`} tone={quota.pct != null && quota.pct >= 1 ? 'ok' : 'warn'} /> : null}
        {canRecon ? (
          <StatCard
            label={t('variance')}
            value={coverage == null ? '—' : `${Math.round(Math.abs(1 - coverage) * 1000) / 10}%`}
            tone={alerts > 0 ? 'danger' : 'ok'}
            hint={alerts > 0 ? t('alertShort') : t('within')}
          />
        ) : null}
      </div>

      {canRecon ? (
        <Panel className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">{t('byPoint')}</h2>
              <p className="text-sm text-muted">{t('preparedVsServed')}</p>
            </div>
            <p className="text-sm font-semibold text-muted">
              {t('pending')}: {pending}
            </p>
          </div>
          {filtered.length === 0 ? <EmptyState title={t('empty')} body={t('dashboardEmptyHint')} /> : null}
          <div className="grid gap-3 lg:grid-cols-2">
            {filtered.map((row) => {
              const name = locale === 'ar' ? row.nameAr : row.nameEn
              const ratio = row.mealsPrepared && row.mealsPrepared > 0 ? row.uniqueServed / row.mealsPrepared : null
              return (
                <div key={row.dpCode} className="rounded-2xl border border-line bg-mist/40 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{name}</p>
                      <p className="font-mono text-xs text-muted" dir="ltr">
                        {row.dpCode}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        row.alert ? 'bg-blocked/10 text-blocked' : 'bg-served/15 text-served'
                      }`}
                    >
                      {row.reason === 'missing_production' ? t('missingShort') : row.alert ? t('alertShort') : t('okShort')}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted">{t('mealsPrepared')}</p>
                      <p className="tabular text-xl font-bold">{row.mealsPrepared ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-muted">{t('servedToday')}</p>
                      <p className="tabular text-xl font-bold text-served">{row.uniqueServed}</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <ProgressBar ratio={ratio} alert={row.alert} />
                    <p className="mt-1 text-xs text-muted">
                      {row.variance != null ? `${t('variance')}: ${Math.round(row.variance * 1000) / 10}%` : t('missing')}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      ) : (
        <Panel>
          <p className="font-bold">
            {t('pending')}: {pending}
          </p>
        </Panel>
      )}

      {Object.keys(reasons).length > 0 ? (
        <Panel>
          <h2 className="font-bold">{t('blockReasons')}</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(reasons).map(([reason, count]) => (
              <li key={reason} className="flex items-center justify-between rounded-xl bg-mist px-3 py-2 text-sm">
                <span>{reasonLabel(t, reason)}</span>
                <span className="tabular font-bold">{count}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {fixes.length > 0 ? (
        <Panel>
          <h2 className="font-bold text-warn">{t('corrections')}</h2>
          <p className="mt-1 text-sm text-muted">{t('correctionHint')}</p>
          <ul className="mt-3 space-y-1 font-mono text-sm" dir="ltr">
            {fixes.map((scan) => (
              <li key={scan.id} className="rounded-lg bg-mist px-3 py-2">
                {scan.hhCode} · {reasonLabel(t, scan.messageKey ?? scan.blockReason)}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  )
}
