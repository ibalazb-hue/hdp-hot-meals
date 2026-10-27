import { useState } from 'react'
import { normalizeHhCode } from '@hdp/rules'
import { apiJson } from '../api'
import { explainError } from '../errors'
import { QrCard } from '../components/QrCard'
import { Alert, Button, EmptyState, Field, PageHeader, Panel, TextInput } from '../components/ui'
import { useI18n } from '../i18n'

interface Household {
  hhCode: string
  dpCode: string
  beneficiaryCount: number
  label: string | null
  status: string
  activeCardCode: string | null
  payload: string | null
}

export function CardsPage() {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<Household[]>([])
  const [selected, setSelected] = useState<Household | null>(null)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [tone, setTone] = useState<'ok' | 'danger'>('ok')
  const [searched, setSearched] = useState(false)

  async function search() {
    const list = await apiJson<Household[]>(`/api/households?q=${encodeURIComponent(query)}`)
    setRows(list)
    setSearched(true)
  }

  async function open(hhCode: string) {
    setSelected(await apiJson<Household>(`/api/households/${encodeURIComponent(hhCode)}`))
    setMessage('')
  }

  async function act(kind: 'void' | 'reissue') {
    if (!selected) return
    try {
      await apiJson(`/api/households/${selected.hhCode}/${kind}`, { method: 'POST', body: JSON.stringify({ reason }) })
      setTone('ok')
      setMessage(kind === 'void' ? t('voidedDone') : t('reissued'))
      await open(selected.hhCode)
    } catch (err) {
      setTone('danger')
      setMessage(explainError(t, err))
    }
  }

  return (
    <div className="grid gap-4">
      <PageHeader title={t('cards')} subtitle={t('tileCards')} />
      <Panel className="grid gap-3">
        <Field label={t('search')}>
          <TextInput data-testid="card-search" dir="ltr" value={query} onChange={(event) => setQuery(event.target.value.toUpperCase())} />
        </Field>
        <Button
          type="button"
          onClick={() => {
            setQuery(normalizeHhCode(query))
            void search()
          }}
        >
          {t('search')}
        </Button>
        {searched && rows.length === 0 ? <EmptyState title={t('empty')} /> : null}
        <ul className="grid gap-2">
          {rows.map((row) => (
            <li key={row.hhCode}>
              <button
                className="flex min-h-14 w-full items-center justify-between rounded-2xl border border-line px-3 text-start hover:bg-mist"
                dir="ltr"
                onClick={() => void open(row.hhCode)}
              >
                <span className="font-mono font-semibold">{row.hhCode}</span>
                <span className={`text-xs font-bold ${row.activeCardCode ? 'text-served' : 'text-blocked'}`}>
                  {row.activeCardCode ? t('active') : t('voided')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      {selected ? (
        <Panel className="grid gap-3">
          <p className="font-mono text-xl font-bold" dir="ltr">
            {selected.hhCode}
          </p>
          <p className="text-sm text-muted">
            {selected.dpCode} · {selected.beneficiaryCount} · {selected.label ?? '—'}
          </p>
          <Field label={t('reason')}>
            <TextInput data-testid="card-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button data-testid="void-card" type="button" tone="blocked" disabled={reason.trim().length < 3 || !selected.activeCardCode} onClick={() => void act('void')}>
              {t('void')}
            </Button>
            <Button data-testid="reissue-card" type="button" disabled={reason.trim().length < 3} onClick={() => void act('reissue')}>
              {t('reissue')}
            </Button>
          </div>
          {message ? <Alert tone={tone === 'ok' ? 'ok' : 'danger'}>{message}</Alert> : null}
          {selected.payload && selected.activeCardCode ? (
            <QrCard hhCode={selected.hhCode} payload={selected.payload} dpName={selected.dpCode} />
          ) : null}
        </Panel>
      ) : null}
    </div>
  )
}
