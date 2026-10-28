import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useI18n } from '../i18n'
import { BrandLogos } from './BrandLogos'
import { Button } from './ui'

export interface EntitlementCardProps {
  hhCode: string
  /** Printed QR encodes household code only (scan still accepts legacy HDP1 payloads). */
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
}

function formatValidity(from?: string | null, to?: string | null): string {
  const start = from?.trim() || '[start — set CARD_VALID_FROM]'
  const end = to?.trim() || '[end — set CARD_VALID_TO]'
  return `${start} – ${end}`
}

/** Single-sided printable Hot Meal Entitlement Card (front only). */
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

  const dpLabel = [props.dpCode, props.dpNameEn || props.dpNameAr].filter(Boolean).join(' — ')
  const holder = props.holderName?.trim() || '—'
  const serial = props.cardSerial?.trim() || '—'
  const batch = props.printBatch?.trim() || '—'
  const validity = formatValidity(props.validFrom, props.validTo)
  const wfp = props.wfpHotline?.trim() || '[WFP Hotline — set WFP_HOTLINE]'
  const hdp = props.hdpHotline?.trim() || '[HDP Hotline — set HDP_HOTLINE]'

  return (
    <div className="entitlement-print mx-auto w-full max-w-md text-ink">
      <article className="entitlement-face entitlement-front rounded-2xl border-2 border-ink bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
          <BrandLogos className="h-14 sm:h-16" />
          <p className="max-w-[9rem] text-end text-[10px] font-semibold uppercase tracking-wide text-muted">
            As authorised
          </p>
        </div>

        <h2 className="mt-3 text-center text-base font-extrabold leading-snug sm:text-lg">
          Hot Meal Entitlement Card – Free of Charge
        </h2>
        <p className="mt-1 text-center text-xs font-semibold text-muted" dir="rtl">
          بطاقة استحقاق وجبة ساخنة – مجاناً
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
          {props.dpNameAr ? (
            <div className="flex justify-between gap-3 border-b border-line/70 py-1" dir="rtl">
              <dt className="text-muted">نقطة التوزيع</dt>
              <dd className="font-semibold">
                {props.dpCode} — {props.dpNameAr}
              </dd>
            </div>
          ) : null}
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

        <p className="mt-3 rounded-xl bg-mist px-3 py-2.5 text-center text-sm font-extrabold text-teal">
          {t('cardAssistanceFree')}
        </p>
        <p className="mt-1 text-center text-xs font-semibold text-muted" dir="rtl">
          المساعدة مجانية — لا تدفع لأي شخص
        </p>

        <ul className="mt-3 list-disc space-y-1 ps-5 text-xs leading-relaxed sm:text-sm">
          <li>{t('cardRuleOneMeal')}</li>
          <li>{t('cardRulePersonal')}</li>
          <li>{t('cardRuleLoss')}</li>
        </ul>

        <dl className="mt-3 grid gap-1.5 border-t border-line pt-3 text-sm">
          <div className="flex justify-between gap-3 py-0.5">
            <dt className="text-muted">{t('wfpHotline')}</dt>
            <dd className="text-end font-semibold" dir="ltr">
              {wfp}
            </dd>
          </div>
          <div className="flex justify-between gap-3 py-0.5">
            <dt className="text-muted">{t('hdpHotline')}</dt>
            <dd className="text-end font-semibold" dir="ltr">
              {hdp}
            </dd>
          </div>
          <div className="flex justify-between gap-3 py-0.5">
            <dt className="text-muted">{t('cardSerial')}</dt>
            <dd className="font-mono text-end text-xs font-bold" dir="ltr">
              {serial}
            </dd>
          </div>
          <div className="flex justify-between gap-3 py-0.5">
            <dt className="text-muted">{t('printBatch')}</dt>
            <dd className="font-mono text-end text-xs font-bold" dir="ltr">
              {batch}
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-center text-[10px] text-muted">
          Humanitarian Community Kitchen – Hot Cooked Meals
        </p>
      </article>

      <Button className="no-print mt-4 w-full" data-testid="print-card" onClick={() => window.print()}>
        {t('print')}
      </Button>
    </div>
  )
}
