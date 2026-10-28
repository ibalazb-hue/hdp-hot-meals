import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useI18n } from '../i18n'
import { BrandLogos } from './BrandLogos'
import { Button } from './ui'

export interface EntitlementCardProps {
  hhCode: string
  holderName?: string | null
  dpCode: string
  dpNameEn?: string | null
  dpNameAr?: string | null
  validFrom?: string | null
  validTo?: string | null
  cardSerial?: string | null
  printBatch?: string | null
  wfpHotline?: string | null
  hdpHotline?: string | null
  beneficiaryCount?: number | null
  titleEn?: string | null
  titleAr?: string | null
  showWfpLogo?: boolean
  showHdpLogo?: boolean
  wfpLogoDataUrl?: string | null
  hdpLogoDataUrl?: string | null
  rulesText?: string | null
  freeLineEn?: string | null
  freeLineAr?: string | null
  complaintsHeadingAr?: string | null
  hotlineHeadingAr?: string | null
  showSerial?: boolean
  showBatch?: boolean
}

function formatValidity(from?: string | null, to?: string | null): string {
  const start = from?.trim() || '—'
  const end = to?.trim() || '—'
  return `${start} – ${end}`
}

/** Single-sided printable Hot Meal Entitlement Card (front only). Content comes from Admin card template. */
export function QrCard(props: EntitlementCardProps) {
  const { t } = useI18n()
  const [qrUrl, setQrUrl] = useState('')
  const qrPayload = props.hhCode.trim().toUpperCase()

  useEffect(() => {
    void QRCode.toDataURL(qrPayload, {
      width: 360,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0b1f2a', light: '#ffffff' },
    }).then(setQrUrl)
  }, [qrPayload])

  const titleEn = props.titleEn?.trim() || 'Hot Meal Entitlement Card – Free of Charge'
  const titleAr = props.titleAr?.trim() || 'بطاقة استحقاق وجبة ساخنة – مجاناً'
  const freeEn = props.freeLineEn?.trim() || t('cardAssistanceFree')
  const freeAr = props.freeLineAr?.trim() || 'المساعدة مجانية — لا تدفع لأي شخص'
  const rules = (props.rulesText?.trim() || `${t('cardRuleOneMeal')}\n${t('cardRulePersonal')}\n${t('cardRuleLoss')}`)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const dpLabel = [props.dpCode, props.dpNameAr || props.dpNameEn].filter(Boolean).join(' — ')
  const holder = props.holderName?.trim() || '—'
  const showSerial = props.showSerial !== false
  const showBatch = props.showBatch !== false
  const serial = props.cardSerial?.trim() || '—'
  const batch = props.printBatch?.trim() || '—'
  const validity = formatValidity(props.validFrom, props.validTo)
  const wfp = props.wfpHotline?.trim() || '—'
  const hdp = props.hdpHotline?.trim() || '—'
  const complaintsHeading = props.complaintsHeadingAr?.trim() || 'المقترحات والشكاوى'
  const hotlineHeading = props.hotlineHeadingAr?.trim() || 'الخط الساخن'

  return (
    <div className="entitlement-print mx-auto w-full max-w-md text-ink">
      <article className="entitlement-face entitlement-front rounded-2xl border-2 border-ink bg-white p-4 shadow-sm sm:p-5">
        <div className="flex w-full items-center justify-between gap-3 border-b border-line pb-3">
          <BrandLogos
            className="h-14 sm:h-16"
            layout="spread"
            showWfp={props.showWfpLogo !== false}
            showHdp={props.showHdpLogo !== false}
            wfpSrc={props.wfpLogoDataUrl}
            hdpSrc={props.hdpLogoDataUrl}
          />
        </div>

        <h2 className="mt-3 text-center text-base font-extrabold leading-snug sm:text-lg">{titleEn}</h2>
        <p className="mt-1 text-center text-xs font-semibold text-muted" dir="rtl">
          {titleAr}
        </p>

        <div className="mt-3 flex flex-col items-center gap-2 sm:mt-4 sm:gap-3">
          {qrUrl ? (
            <img
              src={qrUrl}
              alt={`QR ${props.hhCode}`}
              className="h-40 w-40 rounded-lg border border-line bg-white sm:h-48 sm:w-48"
            />
          ) : (
            <div className="flex h-40 w-40 items-center justify-center rounded-lg border border-dashed border-line text-sm text-muted sm:h-48 sm:w-48">
              QR…
            </div>
          )}
          <p className="font-mono text-xl font-bold tracking-wide" dir="ltr" data-testid="card-hh-code">
            {props.hhCode}
          </p>
        </div>

        <dl className="mt-3 grid gap-1.5 text-sm sm:mt-4 sm:gap-2">
          <div className="flex justify-between gap-3 border-b border-line/70 py-1">
            <dt className="text-muted">{t('cardHolder')}</dt>
            <dd className="text-end font-semibold">{holder}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-line/70 py-1">
            <dt className="text-muted">{t('dp')}</dt>
            <dd className="text-end font-semibold" dir="ltr">
              {dpLabel}
            </dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-line/70 py-1">
            <dt className="text-muted">{t('validityPeriod')}</dt>
            <dd className="text-end font-semibold" dir="ltr">
              {validity}
            </dd>
          </div>
          {props.beneficiaryCount != null && props.beneficiaryCount > 0 ? (
            <div className="flex justify-between gap-3 border-b border-line/70 py-1">
              <dt className="text-muted">{t('beneficiaryCount')}</dt>
              <dd className="font-semibold" data-testid="card-members">
                {props.beneficiaryCount}
              </dd>
            </div>
          ) : null}
        </dl>

        <p className="mt-3 rounded-xl bg-mist px-3 py-2.5 text-center text-sm font-extrabold text-teal">{freeEn}</p>
        <p className="mt-1 text-center text-xs font-semibold text-muted" dir="rtl">
          {freeAr}
        </p>

        <ul className="mt-3 list-disc space-y-1 ps-5 text-xs leading-relaxed sm:text-sm">
          {rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>

        <div className="mt-3 grid gap-2 border-t border-line pt-3" dir="rtl">
          <h3 className="text-center text-sm font-extrabold tracking-wide text-ink" data-testid="card-complaints-heading">
            {complaintsHeading}
          </h3>
          <h3 className="text-center text-sm font-extrabold tracking-wide text-teal" data-testid="card-hotline-heading">
            {hotlineHeading}
          </h3>
          <dl className="grid gap-1.5 text-sm">
            <div className="flex justify-between gap-3 py-0.5">
              <dt className="text-muted">{t('wfpHotline')}</dt>
              <dd className="font-semibold" dir="ltr">
                {wfp}
              </dd>
            </div>
            <div className="flex justify-between gap-3 py-0.5">
              <dt className="text-muted">{t('hdpHotline')}</dt>
              <dd className="font-semibold" dir="ltr">
                {hdp}
              </dd>
            </div>
          </dl>
        </div>

        <dl className="mt-2 grid gap-1.5 text-sm">
          {showSerial ? (
            <div className="flex justify-between gap-3 py-0.5">
              <dt className="text-muted">{t('cardSerial')}</dt>
              <dd className="font-mono text-end text-xs font-bold" dir="ltr">
                {serial}
              </dd>
            </div>
          ) : null}
          {showBatch ? (
            <div className="flex justify-between gap-3 py-0.5">
              <dt className="text-muted">{t('printBatch')}</dt>
              <dd className="font-mono text-end text-xs font-bold" dir="ltr">
                {batch}
              </dd>
            </div>
          ) : null}
        </dl>

        <p className="mt-3 text-center text-[10px] text-muted">Humanitarian Community Kitchen – Hot Cooked Meals</p>
      </article>

      <Button className="no-print mt-4 w-full" data-testid="print-card" onClick={() => window.print()}>
        {t('print')}
      </Button>
    </div>
  )
}
