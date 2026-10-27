import { useState, type FormEvent } from 'react'
import { isHhCode, normalizeHhCode } from '@hdp/rules'
import { useAuth } from '../auth'
import { explainError } from '../errors'
import { useI18n, type CopyKey } from '../i18n'
import { submitScan } from '../submit'
import { SupervisorNames } from '../components/SupervisorNames'
import { Button, Field, Panel, SelectInput, TextInput } from '../components/ui'

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

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    try {
      const scan = await submitScan({
        mode: 'manual',
        hhCode: normalizeHhCode(hh),
        dpCode: dp,
        overrideReason: reason,
        supervisorPin: pin,
      })
      setOk(scan.countsAsDistributed)
      setMessage(t((scan.messageKey as CopyKey) ?? 'unknown'))
    } catch (err) {
      setOk(false)
      setMessage(explainError(t, err))
    }
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <Panel className="grid gap-3">
        <p>{t('sop8')}</p>
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
        <Button data-testid="manual-submit" type="submit" disabled={!isHhCode(hh) || reason.trim().length < 3 || pin.length < 4}>
          {t('submit')}
        </Button>
        {message ? <p className={ok ? 'text-xl font-bold text-served' : 'text-xl font-bold text-blocked'}>{message}</p> : null}
      </Panel>
    </form>
  )
}
