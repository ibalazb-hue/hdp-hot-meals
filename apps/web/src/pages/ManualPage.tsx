import { useState, type FormEvent } from 'react'
import { isHhCode, normalizeHhCode } from '@hdp/rules'
import { useAuth } from '../auth'
import { explainError } from '../errors'
import { reasonLabel, useI18n } from '../i18n'
import { db } from '../db'
import { submitScan } from '../submit'
import { SupervisorNames } from '../components/SupervisorNames'
import { Alert, Button, Field, PageHeader, Panel, SelectInput, TextInput } from '../components/ui'

export function ManualPage() {
  const { session } = useAuth()
  const { t } = useI18n()
  const dps = session?.user.dpCodes ?? []
  const [dp, setDp] = useState(dps[0] ?? '')
  const [hh, setHh] = useState('')
  const [reason, setReason] = useState('')
  const [pin, setPin] = useState('')
  const [message, setMessage] = useState('')
  const [ok, setOk] = useState(false)
  const [members, setMembers] = useState<number | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    try {
      const code = normalizeHhCode(hh)
      const scan = await submitScan({
        mode: 'manual',
        hhCode: code,
        dpCode: dp,
        overrideReason: reason,
        supervisorPin: pin,
      })
      setOk(scan.countsAsDistributed)
      setMessage(reasonLabel(t, scan.messageKey ?? scan.blockReason ?? 'unknown'))
      const household = await db.households.get(code)
      setMembers(household?.beneficiaryCount && household.beneficiaryCount > 0 ? household.beneficiaryCount : null)
    } catch (err) {
      setOk(false)
      setMembers(null)
      setMessage(explainError(t, err))
    }
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <PageHeader title={t('manual')} subtitle={t('tileManual')} />
      <Panel className="grid gap-3">
        <Alert tone="info">{t('sop8')}</Alert>
        <Field label={t('dp')}>
          <SelectInput value={dp} onChange={(event) => setDp(event.target.value)}>
            {dps.map((code) => (
              <option key={code}>{code}</option>
            ))}
          </SelectInput>
        </Field>
        <Field label={t('household')}>
          <TextInput data-testid="manual-hh" dir="ltr" value={hh} onChange={(event) => setHh(event.target.value.toUpperCase())} placeholder="TZ-MDF01-000101" />
        </Field>
        <Field label={t('reason')}>
          <TextInput data-testid="manual-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        {session?.user.role === 'dp_focal' ? <SupervisorNames /> : null}
        <Field label={t('pin')}>
          <TextInput data-testid="manual-pin" dir="ltr" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value)} />
        </Field>
        <Button data-testid="manual-submit" type="submit" size="lg" disabled={!isHhCode(hh) || reason.trim().length < 3 || pin.length < 4}>
          {t('submit')}
        </Button>
        {message ? (
          <div className={`rounded-2xl px-4 py-3 ${ok ? 'bg-served/10 text-served' : 'bg-blocked/10 text-blocked'}`}>
            <p className="text-xl font-bold">{message}</p>
            {members != null ? (
              <p className="mt-1 text-base font-semibold" data-testid="manual-members">
                {t('beneficiaryCount')}: {members}
              </p>
            ) : null}
          </div>
        ) : null}
      </Panel>
    </form>
  )
}
