import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { apiJson } from '../api'
import { explainError } from '../errors'
import { useI18n } from '../i18n'
import { QrCard } from './QrCard'
import { Alert, Button, Field, Panel, TextInput } from './ui'

export interface CardTemplateForm {
  titleEn: string
  titleAr: string
  projectTitleAr: string
  primaryColor: string
  showWfpLogo: boolean
  showHdpLogo: boolean
  wfpLogoDataUrl: string | null
  hdpLogoDataUrl: string | null
  rulesText: string
  freeLineEn: string
  freeLineAr: string
  complaintsHeadingAr: string
  hotlineHeadingAr: string
  hdpPanelTitleAr: string
  hdpPhone: string
  hdpWhatsapp: string
  partnerPanelTitleAr: string
  partnerPhone: string
  partnerWhatsapp: string
  reassuranceTextAr: string
  workingHoursAr: string
  personalNoticeAr: string
  wfpHotline: string
  hdpHotline: string
  validFrom: string
  validTo: string
  printBatch: string
  showSerial: boolean
  showBatch: boolean
  serialPrefix: string
}

async function readLogo(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('invalid_logo')
  if (file.size > 220_000) throw new Error('logo_too_large')
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('invalid_logo'))
    reader.readAsDataURL(file)
  })
  if (dataUrl.length > 350_000) throw new Error('logo_too_large')
  return dataUrl
}

export function CardTemplateAdmin() {
  const { t } = useI18n()
  const [form, setForm] = useState<CardTemplateForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [tone, setTone] = useState<'ok' | 'danger'>('ok')

  useEffect(() => {
    void apiJson<CardTemplateForm>('/api/admin/card-template')
      .then(setForm)
      .catch((err) => {
        setTone('danger')
        setMessage(explainError(t, err))
      })
  }, [t])

  function patch<K extends keyof CardTemplateForm>(key: K, value: CardTemplateForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current))
  }

  async function onLogo(kind: 'wfp' | 'hdp', event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !form) return
    try {
      const dataUrl = await readLogo(file)
      patch(kind === 'wfp' ? 'wfpLogoDataUrl' : 'hdpLogoDataUrl', dataUrl)
      setTone('ok')
      setMessage(t('logoReady'))
    } catch (err) {
      setTone('danger')
      const code = err instanceof Error ? err.message : ''
      setMessage(code === 'invalid_logo' || code === 'logo_too_large' ? t(code) : explainError(t, err))
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!form) return
    setSaving(true)
    setMessage('')
    try {
      const saved = await apiJson<CardTemplateForm>('/api/admin/card-template', {
        method: 'PUT',
        body: JSON.stringify(form),
      })
      setForm(saved)
      setTone('ok')
      setMessage(t('cardTemplateSaved'))
    } catch (err) {
      setTone('danger')
      setMessage(explainError(t, err))
    } finally {
      setSaving(false)
    }
  }

  if (!form) {
    return <Panel>{message ? <Alert tone="danger">{message}</Alert> : <p className="text-sm text-muted">{t('loading')}</p>}</Panel>
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <form className="grid gap-3" onSubmit={onSubmit} data-testid="card-template-form">
          <h2 className="text-lg font-bold">{t('cardTemplate')}</h2>
          <p className="text-sm text-muted">{t('cardTemplateHint')}</p>

          <Field label={t('cardTitleAr')}>
            <TextInput dir="rtl" value={form.titleAr} maxLength={120} onChange={(e) => patch('titleAr', e.target.value)} />
          </Field>
          <Field label={t('projectTitleAr')}>
            <TextInput dir="rtl" value={form.projectTitleAr} maxLength={120} onChange={(e) => patch('projectTitleAr', e.target.value)} />
          </Field>
          <Field label={t('primaryColor')} hint={t('primaryColorHint')}>
            <div className="flex items-center gap-3">
              <input
                type="color"
                data-testid="card-primary-color"
                value={/^#[0-9A-Fa-f]{6}$/.test(form.primaryColor) ? form.primaryColor : '#0B5C6B'}
                onChange={(e) => patch('primaryColor', e.target.value.toUpperCase())}
                className="h-11 w-14 cursor-pointer rounded-xl border border-line bg-white p-1"
              />
              <TextInput
                dir="ltr"
                value={form.primaryColor}
                maxLength={7}
                onChange={(e) => patch('primaryColor', e.target.value.toUpperCase())}
                placeholder="#0B5C6B"
              />
            </div>
          </Field>

          <div className="grid gap-2 rounded-2xl border border-line p-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={form.showWfpLogo} onChange={(e) => patch('showWfpLogo', e.target.checked)} />
              {t('showWfpLogo')}
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={form.showHdpLogo} onChange={(e) => patch('showHdpLogo', e.target.checked)} />
              {t('showHdpLogo')}
            </label>
            <Field label={t('uploadWfpLogo')}>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => void onLogo('wfp', e)} />
              {form.wfpLogoDataUrl ? (
                <button type="button" className="mt-1 text-xs font-bold text-blocked underline" onClick={() => patch('wfpLogoDataUrl', null)}>
                  {t('clearLogo')}
                </button>
              ) : (
                <p className="mt-1 text-xs text-muted">{t('defaultLogoHint')}</p>
              )}
            </Field>
            <Field label={t('uploadHdpLogo')}>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => void onLogo('hdp', e)} />
              {form.hdpLogoDataUrl ? (
                <button type="button" className="mt-1 text-xs font-bold text-blocked underline" onClick={() => patch('hdpLogoDataUrl', null)}>
                  {t('clearLogo')}
                </button>
              ) : (
                <p className="mt-1 text-xs text-muted">{t('defaultLogoHint')}</p>
              )}
            </Field>
          </div>

          <Field label={t('complaintsHeadingAr')}>
            <TextInput dir="rtl" value={form.complaintsHeadingAr} maxLength={120} onChange={(e) => patch('complaintsHeadingAr', e.target.value)} />
          </Field>
          <Field label={t('hotlineHeadingAr')}>
            <TextInput dir="rtl" value={form.hotlineHeadingAr} maxLength={80} onChange={(e) => patch('hotlineHeadingAr', e.target.value)} />
          </Field>

          <div className="grid gap-3 rounded-2xl border border-line p-3">
            <p className="text-sm font-bold">{t('hdpHotlinePanel')}</p>
            <Field label={t('hdpPanelTitleAr')}>
              <TextInput dir="rtl" value={form.hdpPanelTitleAr} maxLength={120} onChange={(e) => patch('hdpPanelTitleAr', e.target.value)} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('hdpPhone')}>
                <TextInput dir="ltr" value={form.hdpPhone} maxLength={80} onChange={(e) => patch('hdpPhone', e.target.value)} />
              </Field>
              <Field label={t('hdpWhatsapp')}>
                <TextInput dir="ltr" value={form.hdpWhatsapp} maxLength={80} onChange={(e) => patch('hdpWhatsapp', e.target.value)} />
              </Field>
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-line p-3">
            <p className="text-sm font-bold">{t('partnerHotlinePanel')}</p>
            <Field label={t('partnerPanelTitleAr')}>
              <TextInput dir="rtl" value={form.partnerPanelTitleAr} maxLength={120} onChange={(e) => patch('partnerPanelTitleAr', e.target.value)} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('partnerPhone')}>
                <TextInput dir="ltr" value={form.partnerPhone} maxLength={80} onChange={(e) => patch('partnerPhone', e.target.value)} />
              </Field>
              <Field label={t('partnerWhatsapp')}>
                <TextInput dir="ltr" value={form.partnerWhatsapp} maxLength={80} onChange={(e) => patch('partnerWhatsapp', e.target.value)} />
              </Field>
            </div>
          </div>

          <Field label={t('workingHoursAr')}>
            <TextInput dir="rtl" data-testid="tpl-working-hours" value={form.workingHoursAr ?? ''} maxLength={200} onChange={(e) => patch('workingHoursAr', e.target.value)} />
          </Field>
          <Field label={t('reassuranceTextAr')}>
            <textarea
              dir="rtl"
              className="min-h-20 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm"
              value={form.reassuranceTextAr}
              maxLength={400}
              onChange={(e) => patch('reassuranceTextAr', e.target.value)}
            />
          </Field>
          <Field label={t('personalNoticeAr')}>
            <textarea
              dir="rtl"
              className="min-h-16 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm"
              value={form.personalNoticeAr}
              maxLength={300}
              onChange={(e) => patch('personalNoticeAr', e.target.value)}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('validFrom')}>
              <TextInput dir="ltr" value={form.validFrom} maxLength={40} placeholder="YYYY-MM-DD" onChange={(e) => patch('validFrom', e.target.value)} />
            </Field>
            <Field label={t('validTo')}>
              <TextInput dir="ltr" value={form.validTo} maxLength={40} placeholder="YYYY-MM-DD" onChange={(e) => patch('validTo', e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-3 rounded-2xl border border-line p-3">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={form.showSerial} onChange={(e) => patch('showSerial', e.target.checked)} />
              {t('showCardSerial')}
            </label>
            <Field label={t('serialPrefix')} hint={t('serialPrefixHint')}>
              <TextInput dir="ltr" value={form.serialPrefix} maxLength={40} onChange={(e) => patch('serialPrefix', e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={form.showBatch} onChange={(e) => patch('showBatch', e.target.checked)} />
              {t('showPrintBatch')}
            </label>
            <Field label={t('printBatch')} hint={t('printBatchHint')}>
              <TextInput dir="ltr" value={form.printBatch} maxLength={60} onChange={(e) => patch('printBatch', e.target.value)} />
            </Field>
          </div>

          <Button type="submit" disabled={saving} data-testid="save-card-template">
            {saving ? t('loading') : t('saveCardTemplate')}
          </Button>
          {message ? <Alert tone={tone === 'ok' ? 'ok' : 'danger'}>{message}</Alert> : null}
        </form>
      </Panel>

      <div className="grid gap-3">
        <p className="text-sm font-bold text-muted">{t('cardPreview')}</p>
        <QrCard
          hhCode="TZ-MDF01-000001"
          holderName="عيّنة مستفيد"
          dpCode="MDF01"
          dpNameEn="Sample point"
          dpNameAr="المظفر"
          beneficiaryCount={5}
          titleAr={form.titleAr}
          projectTitleAr={form.projectTitleAr}
          primaryColor={form.primaryColor}
          showWfpLogo={form.showWfpLogo}
          showHdpLogo={form.showHdpLogo}
          wfpLogoDataUrl={form.wfpLogoDataUrl}
          hdpLogoDataUrl={form.hdpLogoDataUrl}
          complaintsHeadingAr={form.complaintsHeadingAr}
          hotlineHeadingAr={form.hotlineHeadingAr}
          hdpPanelTitleAr={form.hdpPanelTitleAr}
          hdpPhone={form.hdpPhone}
          hdpWhatsapp={form.hdpWhatsapp}
          partnerPanelTitleAr={form.partnerPanelTitleAr}
          partnerPhone={form.partnerPhone}
          partnerWhatsapp={form.partnerWhatsapp}
          reassuranceTextAr={form.reassuranceTextAr}
          workingHoursAr={form.workingHoursAr}
          personalNoticeAr={form.personalNoticeAr}
          validFrom={form.validFrom || '2026-01-01'}
          validTo={form.validTo || '2026-12-31'}
          cardSerial={`${form.serialPrefix}CSAMPLE001`}
          printBatch={form.printBatch || 'PB-20260101-0001'}
          showSerial={form.showSerial}
          showBatch={form.showBatch}
        />
      </div>
    </div>
  )
}
