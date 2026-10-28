import { useEffect, useState } from 'react'
import { apiJson } from '../api'
import { explainError } from '../errors'
import { useI18n } from '../i18n'
import { Alert, Button, EmptyState, Field, Panel, SelectInput, TextInput } from './ui'

interface AuditRow {
  id: string
  createdAt: string | null
  actorId: string | null
  actorUsername: string | null
  actorDisplayName: string | null
  actorRole: string | null
  action: string
  entityType: string
  entityId: string | null
  summary: string
  detail: Record<string, unknown>
  source: string
}

const ENTITY_FILTERS = [
  '',
  'household',
  'card',
  'production',
  'user',
  'distribution_point',
  'card_template',
  'spot_check',
] as const

function formatWhen(value: string | null, locale: string): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(locale === 'ar' ? 'ar-YE' : 'en-GB', { hour12: false })
}

export function AuditLogPanel() {
  const { t, locale } = useI18n()
  const [q, setQ] = useState('')
  const [entityType, setEntityType] = useState('')
  const [rows, setRows] = useState<AuditRow[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load(nextQ = q, nextType = entityType) {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (nextQ.trim()) params.set('q', nextQ.trim())
      if (nextType) params.set('entityType', nextType)
      params.set('limit', '250')
      const list = await apiJson<AuditRow[]>(`/api/admin/audit-log?${params.toString()}`)
      setRows(list)
    } catch (err) {
      setError(explainError(t, err))
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load('', '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="grid gap-4">
      <Panel className="grid gap-3">
        <h2 className="text-lg font-bold">{t('auditLog')}</h2>
        <p className="text-sm text-muted">{t('auditLogHint')}</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto]">
          <Field label={t('search')}>
            <TextInput
              data-testid="audit-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('auditSearchHint')}
            />
          </Field>
          <Field label={t('auditEntityType')}>
            <SelectInput
              data-testid="audit-entity"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            >
              <option value="">{t('auditAllTypes')}</option>
              {ENTITY_FILTERS.filter(Boolean).map((value) => (
                <option key={value} value={value}>
                  {t(`auditType_${value}` as 'auditType_household')}
                </option>
              ))}
            </SelectInput>
          </Field>
          <div className="flex items-end">
            <Button
              type="button"
              data-testid="audit-refresh"
              disabled={loading}
              onClick={() => void load()}
              className="w-full"
            >
              {loading ? t('loading') : t('refresh')}
            </Button>
          </div>
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </Panel>

      <Panel>
        {rows.length === 0 && !loading ? <EmptyState title={t('empty')} body={t('auditLogEmpty')} /> : null}
        <ul className="grid gap-2" data-testid="audit-list">
          {rows.map((row) => {
            const open = expanded === row.id
            const who = row.actorDisplayName || row.actorUsername || t('unknownActor')
            return (
              <li key={row.id} className="rounded-2xl border border-line bg-mist/30">
                <button
                  type="button"
                  className="flex w-full flex-col gap-1 px-3 py-3 text-start hover:bg-mist sm:flex-row sm:items-start sm:justify-between"
                  onClick={() => setExpanded(open ? null : row.id)}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{row.summary}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      <span className="font-bold text-teal">{row.action}</span>
                      {row.entityId ? (
                        <>
                          {' · '}
                          <span dir="ltr">{row.entityId}</span>
                        </>
                      ) : null}
                      {' · '}
                      {who}
                      {row.actorRole ? ` (${row.actorRole})` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-xs font-semibold text-muted" dir="ltr">
                    {formatWhen(row.createdAt, locale)}
                  </div>
                </button>
                {open ? (
                  <pre
                    className="overflow-x-auto border-t border-line bg-white px-3 py-2 text-[11px] leading-relaxed text-ink"
                    dir="ltr"
                  >
                    {JSON.stringify(
                      {
                        action: row.action,
                        entityType: row.entityType,
                        entityId: row.entityId,
                        actor: {
                          id: row.actorId,
                          username: row.actorUsername,
                          displayName: row.actorDisplayName,
                          role: row.actorRole,
                        },
                        source: row.source,
                        detail: row.detail,
                      },
                      null,
                      2,
                    )}
                  </pre>
                ) : null}
              </li>
            )
          })}
        </ul>
      </Panel>
    </div>
  )
}
