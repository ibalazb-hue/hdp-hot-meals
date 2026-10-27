import { useEffect, useState } from 'react'
import { adenDate } from '@hdp/rules'
import { apiJson } from '../api'
import { Button, Panel, TextInput } from '../components/ui'
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
  const [message, setMessage] = useState('')
  const [finding, setFinding] = useState('Queue respected')
  const [dp, setDp] = useState('')

  async function load(next = date) {
    const body = await apiJson<{ rows: Row[] }>(`/api/reconciliation?date=${next}`)
    setRows(body.rows)
    setPrepared(Object.fromEntries(body.rows.map((row) => [row.dpCode, row.mealsPrepared == null ? '' : String(row.mealsPrepared)])))
    if (!dp && body.rows[0]) setDp(body.rows[0].dpCode)
  }

  useEffect(() => {
    void load(date).catch((error) => setMessage(explainError(t, error)))
  }, [date])

  return (
    <div className="grid gap-4">
      <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      {rows.some((row) => row.alert) ? <p className="rounded-2xl bg-blocked px-4 py-3 font-semibold text-white">{t('alert')}</p> : null}
      {rows.map((row) => (
        <Panel key={row.dpCode} className="grid gap-2">
          <h2 className="text-lg font-bold">{locale === 'ar' ? row.nameAr : row.nameEn}</h2>
          <p className="font-mono" dir="ltr">
            {row.dpCode}
          </p>
          <p>
            {t('servedToday')}: {row.uniqueServed}
          </p>
          <label className="text-sm font-semibold">
            {t('mealsPrepared')}
            <TextInput
              inputMode="numeric"
              value={prepared[row.dpCode] ?? ''}
              onChange={(event) => setPrepared((current) => ({ ...current, [row.dpCode]: event.target.value }))}
            />
          </label>
          <p className={row.alert ? 'font-bold text-blocked' : 'text-served'}>
            {row.reason === 'missing_production' ? t('missing') : row.alert ? t('alert') : t('within')}
            {row.variance != null ? ` (${Math.round(row.variance * 1000) / 10}%)` : ''}
          </p>
          <Button
            type="button"
            onClick={() => {
              void apiJson('/api/production', {
                method: 'POST',
                body: JSON.stringify({ dpCode: row.dpCode, productionDate: date, mealsPrepared: Number(prepared[row.dpCode] || 0) }),
              })
                .then(() => {
                  setMessage(t('productionSaved'))
                  return load(date)
                })
                .catch((error) => setMessage(explainError(t, error)))
            }}
          >
            {t('save')}
          </Button>
        </Panel>
      ))}
      <Panel className="grid gap-2">
        <h2 className="font-bold">{t('finding')}</h2>
        <TextInput value={dp} onChange={(event) => setDp(event.target.value.toUpperCase())} dir="ltr" />
        <TextInput value={finding} onChange={(event) => setFinding(event.target.value)} />
        <Button
          type="button"
          onClick={() => {
            void apiJson('/api/spot-checks', { method: 'POST', body: JSON.stringify({ dpCode: dp, finding }) })
              .then(() => setMessage(t('spotSaved')))
              .catch((error) => setMessage(explainError(t, error)))
          }}
        >
          {t('save')}
        </Button>
        {message ? <p>{message}</p> : null}
      </Panel>
    </div>
  )
}
