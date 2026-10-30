import { useEffect, useState, type FormEvent } from 'react'
import { apiJson } from '../api'
import { explainError } from '../errors'
import { useAuth } from '../auth'
import { QrCard } from '../components/QrCard'
import { HouseholdProfileForm, profilePayload, type HouseholdProfile } from '../components/HouseholdProfileForm'
import { Alert, Button, Field, PageHeader, Panel, SelectInput, TextInput } from '../components/ui'
import { useI18n } from '../i18n'

interface Issued {
  hhCode: string
  dpCode: string
  cardCode: string
  payload: string
  beneficiaryCount: number
  label?: string | null
  familyName?: string | null
  dpNameEn?: string | null
  dpNameAr?: string | null
  holderName?: string | null
  cardSerial?: string | null
  printBatch?: string | null
  validFrom?: string | null
  validTo?: string | null
  wfpHotline?: string | null
  hdpHotline?: string | null
  titleAr?: string | null
  projectTitleAr?: string | null
  primaryColor?: string | null
  showWfpLogo?: boolean
  showHdpLogo?: boolean
  wfpLogoDataUrl?: string | null
  hdpLogoDataUrl?: string | null
  complaintsHeadingAr?: string | null
  hotlineHeadingAr?: string | null
  hdpPanelTitleAr?: string | null
  hdpPhone?: string | null
  hdpWhatsapp?: string | null
  partnerPanelTitleAr?: string | null
  partnerPhone?: string | null
  partnerWhatsapp?: string | null
  reassuranceTextAr?: string | null
  personalNoticeAr?: string | null
  showSerial?: boolean
  showBatch?: boolean
}

export function RegisterPage() {
  const { session } = useAuth()
  const { t } = useI18n()
  const [dps, setDps] = useState<Array<{ code: string; nameEn: string; nameAr: string }>>([])
  const [dp, setDp] = useState(session?.user.dpCodes[0] ?? '')
  const [count, setCount] = useState('5')
  const [label, setLabel] = useState('')
  const [familyName, setFamilyName] = useState('')
  const [profile, setProfile] = useState<HouseholdProfile>({})
  const autoTotal = profile.males != null || profile.females != null ? (profile.males ?? 0) + (profile.females ?? 0) : null
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
        body: JSON.stringify({ dpCode: dp, beneficiaryCount: autoTotal && autoTotal > 0 ? autoTotal : Number(count), label, familyName: familyName.trim() || null, ...profilePayload(profile) }),
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
            <TextInput data-testid="register-count" inputMode="numeric" value={autoTotal && autoTotal > 0 ? String(autoTotal) : count} disabled={autoTotal != null && autoTotal > 0} onChange={(event) => setCount(event.target.value)} />
          </Field>
          <Field label={t('familyName')}>
            <TextInput data-testid="register-family" value={familyName} onChange={(event) => setFamilyName(event.target.value)} maxLength={80} />
          </Field>
          <Field label={t('label')}>
            <TextInput value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} />
          </Field>
          <HouseholdProfileForm value={profile} onChange={setProfile} />
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
            <QrCard
              hhCode={issued.hhCode}
              holderName={issued.familyName || issued.holderName || issued.label || familyName || label}
              dpCode={issued.dpCode}
              dpNameEn={issued.dpNameEn ?? point?.nameEn}
              dpNameAr={issued.dpNameAr ?? point?.nameAr}
              validFrom={issued.validFrom}
              validTo={issued.validTo}
              cardSerial={issued.cardSerial ?? issued.cardCode}
              printBatch={issued.printBatch}
              beneficiaryCount={issued.beneficiaryCount}
              titleAr={issued.titleAr}
              projectTitleAr={issued.projectTitleAr}
              primaryColor={issued.primaryColor}
              showWfpLogo={issued.showWfpLogo}
              showHdpLogo={issued.showHdpLogo}
              wfpLogoDataUrl={issued.wfpLogoDataUrl}
              hdpLogoDataUrl={issued.hdpLogoDataUrl}
              complaintsHeadingAr={issued.complaintsHeadingAr}
              hotlineHeadingAr={issued.hotlineHeadingAr}
              hdpPanelTitleAr={issued.hdpPanelTitleAr}
              hdpPhone={issued.hdpPhone ?? issued.hdpHotline}
              hdpWhatsapp={issued.hdpWhatsapp}
              partnerPanelTitleAr={issued.partnerPanelTitleAr}
              partnerPhone={issued.partnerPhone}
              partnerWhatsapp={issued.partnerWhatsapp}
              reassuranceTextAr={issued.reassuranceTextAr}
              personalNoticeAr={issued.personalNoticeAr}
              showSerial={issued.showSerial}
              showBatch={issued.showBatch}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
