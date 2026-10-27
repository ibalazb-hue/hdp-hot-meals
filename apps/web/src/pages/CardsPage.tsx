import { useState } from 'react'
import { normalizeHhCode } from '@hdp/rules'
import { apiJson } from '../api'
import { explainError } from '../errors'
import { QrCard } from '../components/QrCard'
import { Button, Field, Panel, TextInput } from '../components/ui'
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

  async function search() {
    const list = await apiJson<Household[]>(`/api/households?q=${encodeURIComponent(query)}`)
    setRows(list)
  }

  async function open(hhCode: string) {
    setSelected(await apiJson<Household>(`/api/households/${encodeURIComponent(hhCode)}`))
    setMessage('')
  }

  async function act(kind: 'void' | 'reissue') {
    if (!selected) return
    try {
      await apiJson(`/api/households/${selected.hhCode}/${kind}`, { method: 'POST', body: JSON.stringify({ reason }) })
      setMessage(kind === 'void' ? t('voidedDone') : t('reissued'))
      await open(selected.hhCode)
    } catch (err) {
      setMessage(explainError(t, err))
    }
  }

  return (
    <div className="grid gap-4">
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
        {rows.map((row) => (
          <button key={row.hhCode} className="min-h-14 rounded-2xl border border-line text-start px-3" dir="ltr" onClick={() => void open(row.hhCode)}>
            {row.hhCode} · {row.activeCardCode ? t('active') : t('voided')}
          </button>
        ))}
      </Panel>
      {selected ? (
        <Panel className="grid gap-3">
          <p className="font-mono text-xl font-bold" dir="ltr">
            {selected.hhCode}
          </p>
          <p>
            {selected.dpCode} · {selected.beneficiaryCount}
          </p>
          <Field label={t('reason')}>
            <TextInput data-testid="card-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <Button data-testid="void-card" type="button" tone="blocked" disabled={reason.trim().length < 3 || !selected.activeCardCode} onClick={() => void act('void')}>
            {t('void')}
          </Button>
          <Button data-testid="reissue-card" type="button" disabled={reason.trim().length < 3} onClick={() => void act('reissue')}>
            {t('reissue')}
          </Button>
          {message ? <p>{message}</p> : null}
          {selected.payload && selected.activeCardCode ? (
            <QrCard hhCode={selected.hhCode} payload={selected.payload} dpName={selected.dpCode} />
          ) : null}
        </Panel>
      ) : null}
    </div>
  )
}
