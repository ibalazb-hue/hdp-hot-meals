import { useEffect, useMemo, useState } from 'react'
import { adenDate } from '@hdp/rules'
import { apiJson } from '../api'
import { Alert, Button, EmptyState, Field, PageHeader, Panel, ProgressBar, StatCard, TextInput } from '../components/ui'
import { explainError } from '../errors'
import { useI18n } from '../i18n'

interface Row {
  dpCode: string
  nameEn: string
  nameAr: string
  mealsPrepared: number | null
  uniqueServed: number
  variance: number | null
  alert: boolean
  reason: string | null
}

export function ReconcilePage() {
  const { t, locale } = useI18n()
  const [date, setDate] = useState(adenDate())
  const [rows, setRows] = useState<Row[]>([])
  const [prepared, setPrepared] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [tone, setTone] = useState<'ok' | 'danger' | 'warn'>('ok')
  const [finding, setFinding] = useState('')
  const [dp, setDp] = useState('')

  async function load(next = date) {
    const body = await apiJson<{ rows: Row[] }>(`/api/reconciliation?date=${next}`)
    setRows(body.rows)
    setPrepared(Object.fromEntries(body.rows.map((row) => [row.dpCode, row.mealsPrepared == null ? '' : String(row.mealsPrepared)])))
    if (!dp && body.rows[0]) setDp(body.rows[0].dpCode)
  }

  useEffect(() => {
    void load(date).catch((error) => {
      setTone('danger')
      setMessage(explainError(t, error))
    })
  }, [date])

  const totals = useMemo(() => {
    const preparedSum = rows.reduce((sum, row) => sum + (row.mealsPrepared ?? 0), 0)
    const servedSum = rows.reduce((sum, row) => sum + row.uniqueServed, 0)
    const alerts = rows.filter((row) => row.alert).length
    const missing = rows.filter((row) => row.reason === 'missing_production').length
    return { preparedSum, servedSum, alerts, missing }
  }, [rows])

  async function saveProduction(row: Row) {
    setSaving(row.dpCode)
    setMessage('')
    try {
      await apiJson('/api/production', {
        method: 'POST',
        body: JSON.stringify({
          dpCode: row.dpCode,
          productionDate: date,
          mealsPrepared: Number(prepared[row.dpCode] || 0),
        }),
      })
      setTone('ok')
      setMessage(t('productionSaved'))
      await load(date)
    } catch (error) {
      setTone('danger')
      setMessage(explainError(t, error))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="grid gap-4">
      <PageHeader title={t('reconcile')} subtitle={t('reconcileSubtitle')} />

      <Field label={t('day')}>
        <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </Field>

      {message ? <Alert tone={tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : 'danger'}>{message}</Alert> : null}
      {totals.alerts > 0 ? <Alert tone="danger">{t('alert')}</Alert> : null}
      {totals.missing > 0 && totals.alerts === 0 ? <Alert tone="warn">{t('missing')}</Alert> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('mealsPrepared')} value={totals.preparedSum} tone="teal" />
        <StatCard label={t('servedToday')} value={totals.servedSum} tone="ok" />
        <StatCard label={t('alertShort')} value={totals.alerts} tone={totals.alerts ? 'danger' : 'ok'} />
        <StatCard label={t('missingShort')} value={totals.missing} tone={totals.missing ? 'warn' : 'ok'} />
      </div>

      {rows.length === 0 ? <EmptyState title={t('empty')} body={t('noPointsAssigned')} /> : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((row) => {
          const name = locale === 'ar' ? row.nameAr : row.nameEn
          const ratio = row.mealsPrepared && row.mealsPrepared > 0 ? row.uniqueServed / row.mealsPrepared : null
          return (
            <Panel key={row.dpCode} className="grid gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold">{name}</h2>
                  <p className="font-mono text-sm text-muted" dir="ltr">
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

              <div className="grid grid-cols-2 gap-3 rounded-2xl bg-mist/60 p-3">
                <div>
                  <p className="text-xs font-semibold text-muted">{t('servedToday')}</p>
                  <p className="tabular text-2xl font-bold text-served">{row.uniqueServed}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted">{t('variance')}</p>
                  <p className={`tabular text-2xl font-bold ${row.alert ? 'text-blocked' : 'text-ink'}`}>
                    {row.variance != null ? `${Math.round(row.variance * 1000) / 10}%` : '—'}
                  </p>
                </div>
              </div>

              <ProgressBar ratio={ratio} alert={row.alert} />

              <Field label={t('mealsPrepared')} hint={t('enterMealsHint')}>
                <TextInput
                  inputMode="numeric"
                  value={prepared[row.dpCode] ?? ''}
                  onChange={(event) => setPrepared((current) => ({ ...current, [row.dpCode]: event.target.value.replace(/[^\d]/g, '') }))}
                />
              </Field>

              <Button type="button" disabled={saving === row.dpCode} onClick={() => void saveProduction(row)}>
                {saving === row.dpCode ? t('saving') : t('saveMealsPrepared')}
              </Button>
            </Panel>
          )
        })}
      </div>

      <Panel className="grid gap-3">
        <h2 className="font-bold">{t('finding')}</h2>
        <p className="text-sm text-muted">{t('spotHint')}</p>
        <Field label={t('dp')}>
          <TextInput value={dp} onChange={(event) => setDp(event.target.value.toUpperCase())} dir="ltr" placeholder="MDF01" />
        </Field>
        <Field label={t('finding')}>
          <TextInput value={finding} onChange={(event) => setFinding(event.target.value)} placeholder={t('findingPlaceholder')} />
        </Field>
        <Button
          type="button"
          tone="sand"
          onClick={() => {
            void apiJson('/api/spot-checks', { method: 'POST', body: JSON.stringify({ dpCode: dp, finding }) })
              .then(() => {
                setTone('ok')
                setMessage(t('spotSaved'))
                setFinding('')
              })
              .catch((error) => {
                setTone('danger')
                setMessage(explainError(t, error))
              })
          }}
        >
          {t('save')}
        </Button>
      </Panel>
    </div>
  )
}
