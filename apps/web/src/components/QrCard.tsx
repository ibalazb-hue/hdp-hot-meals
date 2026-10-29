import { useEffect, useState, type CSSProperties } from 'react'
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
  beneficiaryCount?: number | null
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
  /** Hide the single-card print button (used in bulk sheets). */
  hidePrintButton?: boolean
  /** Which faces to render. Default both. */
  face?: 'both' | 'front' | 'back'
}

function formatValidity(from?: string | null, to?: string | null): string {
  const start = from?.trim() || '—'
  const end = to?.trim() || '—'
  return `${start} – ${end}`
}

function PhoneIcon() {
  return (
    <svg className="card-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.2 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1L6.6 10.8z"
      />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg className="card-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a9.9 9.9 0 0 0-8.5 15l-1.1 4 4.1-1.1A9.9 9.9 0 1 0 12 2zm0 1.8a8.1 8.1 0 0 1 6.9 12.2l.4.7-.5.3a8.1 8.1 0 0 1-11.9-6.9A8.1 8.1 0 0 1 12 3.8zm-3.3 2.7c.2 0 .4 0 .6.1.2.1.4.5.5.8l.7 1.7c.1.2 0 .5-.1.7l-.5.7c-.1.2-.1.4 0 .6.5.9 1.3 1.7 2.2 2.2.2.1.4.1.6 0l.7-.5c.2-.1.5-.2.7-.1l1.7.7c.3.1.7.3.8.5.1.2.1.4.1.6 0 .2 0 .4-.1.6-.3.7-1.1 1.2-1.9 1.2h-.2c-2.6-.2-5-1.5-6.7-3.6-1.5-1.8-2.2-4-2.2-6.3 0-.8.5-1.6 1.2-1.9.2-.1.4-.1.6-.1z"
      />
    </svg>
  )
}

function HotlinePanel({
  title,
  phone,
  whatsapp,
}: {
  title: string
  phone: string
  whatsapp: string
}) {
  return (
    <div className="card-hotline-panel">
      <div className="card-hotline-panel-title">{title || '—'}</div>
      <div className="card-hotline-row">
        <PhoneIcon />
        <span dir="ltr">{phone || '—'}</span>
      </div>
      <div className="card-hotline-row">
        <WhatsAppIcon />
        <span dir="ltr">{whatsapp || '—'}</span>
      </div>
    </div>
  )
}

function normalizeColor(value?: string | null): string {
  const raw = (value || '').trim()
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) return raw.toUpperCase()
  if (/^[0-9A-Fa-f]{6}$/.test(raw)) return `#${raw.toUpperCase()}`
  return '#0B5C6B'
}

/** Arabic-only entitlement card: landscape front + back (credit-card proportions). */
export function QrCard(props: EntitlementCardProps) {
  const { t } = useI18n()
  const [qrUrl, setQrUrl] = useState('')
  const qrPayload = props.hhCode.trim().toUpperCase()
  const face = props.face || 'both'
  const color = normalizeColor(props.primaryColor)
  const cardStyle = { ['--card-teal' as string]: color } as CSSProperties

  useEffect(() => {
    void QRCode.toDataURL(qrPayload, {
      width: 640,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0b1f2a', light: '#ffffff' },
    }).then(setQrUrl)
  }, [qrPayload])

  const titleAr = props.titleAr?.trim() || 'بطاقة أسرة مستفيدة'
  const projectTitle = props.projectTitleAr?.trim() || 'المطبخ المجتمعي'
  const holder = props.holderName?.trim() || '—'
  const count =
    props.beneficiaryCount != null && props.beneficiaryCount > 0 ? String(props.beneficiaryCount) : '—'
  const district = (props.dpNameAr || props.dpNameEn || props.dpCode || '—').trim() || '—'
  const validity = formatValidity(props.validFrom, props.validTo)
  const complaints = props.complaintsHeadingAr?.trim() || 'الشكاوى والمقترحات'
  const hotlineHeading = props.hotlineHeadingAr?.trim() || 'الخط الساخن'
  const hdpTitle = props.hdpPanelTitleAr?.trim() || 'برنامج التنمية الإنسانية'
  const partnerTitle = props.partnerPanelTitleAr?.trim() || ''
  const reassurance =
    props.reassuranceTextAr?.trim() ||
    'المساعدة مجانية بالكامل — لا تدفع لأي شخص. وجبة واحدة لكل أسرة في اليوم.'
  const notice =
    props.personalNoticeAr?.trim() || 'هذه البطاقة شخصية وغير قابلة للبيع. بلّغ عن الفقدان في مكتب المساعدة.'
  const showSerial = props.showSerial !== false
  const showBatch = props.showBatch !== false
  const serial = props.cardSerial?.trim() || ''
  const batch = props.printBatch?.trim() || ''

  const front = (
    <article className="entitlement-face entitlement-front entitlement-card-mm" style={cardStyle}>
      <div className="card-teal-band" aria-hidden="true" />
      <div className="card-front-body">
        <div className="card-logo-row">
          <BrandLogos
            className="h-10 sm:h-11"
            layout="spread"
            showWfp={props.showWfpLogo !== false}
            showHdp={props.showHdpLogo !== false}
            wfpSrc={props.wfpLogoDataUrl}
            hdpSrc={props.hdpLogoDataUrl}
          />
        </div>

        <div className="card-front-columns">
          <div className="card-front-info">
            <h2 className="card-main-title">{titleAr}</h2>
            <p className="card-project-title">{projectTitle}</p>

            <div className="card-fields">
              <div className="card-field-row">
                <span className="card-field-label">الاسم</span>
                <span className="card-field-value">{holder}</span>
              </div>
              <div className="card-field-row">
                <span className="card-field-label">العدد</span>
                <span className="card-field-value" data-testid="card-members">
                  {count}
                </span>
              </div>
              <div className="card-field-row">
                <span className="card-field-label">المديرية</span>
                <span className="card-field-value">{district}</span>
              </div>
            </div>

            <div className="card-dates" dir="ltr">
              <span>{validity}</span>
            </div>
          </div>

          <div className="card-front-qr">
            {qrUrl ? (
              <img src={qrUrl} alt={`QR ${props.hhCode}`} className="card-qr-img" />
            ) : (
              <div className="card-qr-placeholder">QR…</div>
            )}
            <p className="card-hh-code" dir="ltr" data-testid="card-hh-code">
              {props.hhCode}
            </p>
          </div>
        </div>
      </div>
    </article>
  )

  const back = (
    <article className="entitlement-face entitlement-back entitlement-card-mm" style={cardStyle}>
      <div className="card-teal-band" aria-hidden="true" />
      <div className="card-back-body">
        <header className="card-back-header">
          <h2 className="card-back-title" data-testid="card-complaints-heading">
            {complaints}
          </h2>
          <p className="card-hotline-label" data-testid="card-hotline-heading">
            {hotlineHeading}
          </p>
        </header>

        <div className="card-hotline-grid">
          <HotlinePanel title={hdpTitle} phone={props.hdpPhone || ''} whatsapp={props.hdpWhatsapp || ''} />
          <HotlinePanel title={partnerTitle} phone={props.partnerPhone || ''} whatsapp={props.partnerWhatsapp || ''} />
        </div>

        <p className="card-reassurance">{reassurance}</p>
        <p className="card-personal-notice">{notice}</p>

        {(showSerial && serial) || (showBatch && batch) ? (
          <dl className="card-meta" dir="ltr">
            {showSerial && serial ? (
              <div>
                <dt>{t('cardSerial')}</dt>
                <dd>{serial}</dd>
              </div>
            ) : null}
            {showBatch && batch ? (
              <div>
                <dt>{t('printBatch')}</dt>
                <dd>{batch}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </div>
    </article>
  )

  const bulk = props.hidePrintButton || face !== 'both'
  return (
    <div className={`entitlement-print mx-auto w-full text-ink${bulk ? ' bulk-card' : ''}`} dir="rtl">
      {face === 'back' ? null : front}
      {face === 'front' ? null : back}
      {!props.hidePrintButton && face === 'both' ? (
        <Button className="no-print mt-4 w-full" data-testid="print-card" onClick={() => window.print()}>
          {t('print')}
        </Button>
      ) : null}
    </div>
  )
}

export function chunkCards<T>(items: T[], size = 3): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
