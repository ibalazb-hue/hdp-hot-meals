import { useEffect, useState, type FormEvent } from 'react'
import { apiJson } from '../api'
import { explainError } from '../errors'
import { useAuth } from '../auth'
import { QrCard } from '../components/QrCard'
import { Alert, Button, Field, PageHeader, Panel, SelectInput, TextInput } from '../components/ui'
import { useI18n } from '../i18n'

interface Issued {
  hhCode: string
  dpCode: string
  cardCode: string
  payload: string
  beneficiaryCount: number
}

export function RegisterPage() {
  const { session } = useAuth()
  const { t } = useI18n()
  const [dps, setDps] = useState<Array<{ code: string; nameEn: string; nameAr: string }>>([])
  const [dp, setDp] = useState(session?.user.dpCodes[0] ?? '')
  const [count, setCount] = useState('5')
  const [label, setLabel] = useState('')
  const [issued, setIssued] = useState<Issued | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void apiJson<Array<{ code: string; nameEn: string; nameAr: string }>>('/api/dps')
      .then((rows) => {
        setDps(rows)
        if (!dp && rows[0]) setDp(rows[0].code)
      })
      .catch(() => setError(t('offline')))
  }, [dp, t])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      const body = await apiJson<Issued>('/api/households', {
        method: 'POST',
        body: JSON.stringify({ dpCode: dp, beneficiaryCount: Number(count), label }),
      })
      setIssued(body)
    } catch (err) {
      setError(explainError(t, err))
    }
  }

  const point = dps.find((row) => row.code === dp)

  return (
    <div className="grid gap-4">
      <PageHeader title={t('register')} subtitle={t('tileRegister')} />
      <Panel>
        <form className="grid gap-3" onSubmit={onSubmit}>
          <Field label={t('dp')}>
            <SelectInput data-testid="register-dp" value={dp} onChange={(event) => setDp(event.target.value)}>
              {dps.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.code} — {row.nameEn}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label={t('beneficiaryCount')}>
            <TextInput data-testid="register-count" inputMode="numeric" value={count} onChange={(event) => setCount(event.target.value)} />
          </Field>
          <Field label={t('label')}>
            <TextInput value={label} onChange={(event) => setLabel(event.target.value)} maxLength={40} />
          </Field>
          <Button data-testid="register-submit" type="submit" size="lg">
            {t('register')}
          </Button>
          {error ? <Alert tone="danger">{error}</Alert> : null}
        </form>
      </Panel>
      {issued ? (
        <div>
          <Alert tone="ok">{t('registered')}</Alert>
          <div className="mt-3">
            <QrCard hhCode={issued.hhCode} payload={issued.payload} dpName={point ? `${point.nameEn} / ${point.nameAr}` : issued.dpCode} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
