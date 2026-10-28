import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useI18n } from '../i18n'
import { BrandLogos } from './BrandLogos'
import { Button } from './ui'

export function QrCard({
  hhCode,
  payload,
  dpName,
  beneficiaryCount,
}: {
  hhCode: string
  payload: string
  dpName: string
  beneficiaryCount?: number | null
}) {
  const { t } = useI18n()
  const [url, setUrl] = useState('')
  useEffect(() => {
    void QRCode.toDataURL(payload, { width: 320, margin: 1, errorCorrectionLevel: 'M' }).then(setUrl)
  }, [payload])

  return (
    <article className="print-card mx-auto max-w-sm rounded-3xl border border-ink bg-white p-5 text-center text-ink">
      <div className="flex justify-center">
        <BrandLogos className="h-16" />
      </div>
      <h2 className="mt-1 text-xl font-bold">Hot meal · وجبة ساخنة</h2>
      <p className="text-sm">Taiz · تعز</p>
      {url ? <img src={url} alt="" className="mx-auto mt-3 h-56 w-56" /> : null}
      <p className="mt-2 font-mono text-lg font-bold" dir="ltr">
        {hhCode}
      </p>
      <p className="text-sm">{dpName}</p>
      {beneficiaryCount != null && beneficiaryCount > 0 ? (
        <p className="mt-1 text-sm font-semibold" data-testid="card-members">
          {t('beneficiaryCount')}: {beneficiaryCount}
        </p>
      ) : null}
      <p className="mt-3 text-sm font-semibold">One meal per household per day</p>
      <p className="text-sm font-semibold">وجبة واحدة لكل أسرة في اليوم</p>
      <Button className="no-print mt-4 w-full" onClick={() => window.print()}>
        {t('print')}
      </Button>
    </article>
  )
}
