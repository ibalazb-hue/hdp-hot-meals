import { useEffect, useState } from 'react'
import { adenDate } from '@hdp/rules'
import { ApiError, api } from '../api'
import { explainError } from '../errors'
import { useAuth } from '../auth'
import { db } from '../db'
import { pendingCount } from '../submit'
import { Button, Field, Panel, SelectInput, TextInput } from '../components/ui'
import { useI18n } from '../i18n'

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function ExportPage() {
  const { session } = useAuth()
  const { t } = useI18n()
  const [date, setDate] = useState(adenDate())
  const [dp, setDp] = useState('')
  const [pending, setPending] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    void pendingCount().then(setPending)
  }, [])

  return (
    <Panel className="grid gap-3">
      <p>{t('exportHint')}</p>
      {pending > 0 ? (
        <p className="font-semibold text-warn">
          {t('exportPending')} ({pending})
        </p>
      ) : null}
      <Field label={t('dp')}>
        <SelectInput value={dp} onChange={(event) => setDp(event.target.value)}>
          <option value="">{t('assigned')}</option>
          {(session?.user.dpCodes ?? []).map((code) => (
            <option key={code}>{code}</option>
          ))}
        </SelectInput>
      </Field>
      <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      <Button
        data-testid="export-wfp"
        type="button"
        disabled={pending > 0}
        onClick={() => {
          setError('')
          void api(`/api/export/register.csv?date=${date}${dp ? `&dp=${dp}` : ''}`)
            .then(async (response) => {
              if (!response.ok) {
                const body = (await response.json().catch(() => ({}))) as { error?: string }
                setError(explainError(t, new ApiError(response.status, body.error ?? 'request_failed')))
                return
              }
              download(`hdp-register-${date}.csv`, await response.text())
            })
            .catch(() => setError(t('offline')))
        }}
      >
        {t('download')}
      </Button>
      <Button
        type="button"
        tone="sand"
        onClick={() => {
          void db.scans
            .where('scanDate')
            .equals(date)
            .toArray()
            .then((rows) => {
              const filtered = dp ? rows.filter((row) => row.dpCode === dp) : rows
              const lines = ['scan_date,dp_code,hh_code,result,counts_as_distributed,offline_flag,synced']
              for (const row of filtered) {
                lines.push([row.scanDate, row.dpCode, row.hhCode ?? '', row.result, row.countsAsDistributed, row.offlineFlag, row.synced].join(','))
              }
              download(`hdp-device-${date}.csv`, `\uFEFF${lines.join('\n')}\n`)
            })
        }}
      >
        {t('deviceOnly')}
      </Button>
      {error ? <p className="text-blocked">{error}</p> : null}
    </Panel>
  )
}
