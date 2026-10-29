import { useEffect, useState } from 'react'
import { apiJson } from '../api'
import { explainError } from '../errors'
import { useI18n } from '../i18n'
import { Alert, Button, Panel } from './ui'

interface Status {
  enabled: boolean
  createdAt: string | null
  prefix: string | null
}

const FEEDS: Array<{ name: string; en: string; ar: string }> = [
  { name: 'daily', en: 'Prepared vs served per DP per day (main reconciliation table)', ar: 'المحضّر مقابل الموزّع لكل نقطة ولكل يوم (جدول المطابقة الرئيسي)' },
  { name: 'scans', en: 'Every scan: result, served flag, offline, operator, block reason', ar: 'كل عملية مسح: النتيجة، التوزيع، دون اتصال، المشغّل، سبب الرفض' },
  { name: 'production', en: 'Meals prepared entered by MEAL', ar: 'الوجبات المحضّرة المُدخلة من المتابعة والتقييم' },
  { name: 'households', en: 'Household registry (no holder names)', ar: 'سجل الأسر (بدون أسماء)' },
  { name: 'cards', en: 'Card issue / void / reissue events', ar: 'إصدار / إلغاء / إعادة إصدار البطاقات' },
  { name: 'distribution_points', en: 'DPs with district and GPS', ar: 'نقاط التوزيع مع المديرية والموقع' },
  { name: 'focal_points', en: 'Staff (focal points, supervisors) and assigned DPs', ar: 'الموظفون (ضباط الارتباط والمشرفون) والنقاط المسندة' },
]

export function PowerBiPanel() {
  const { locale } = useI18n()
  const ar = locale === 'ar'
  const [status, setStatus] = useState<Status | null>(null)
  const [newKey, setNewKey] = useState('')
  const [msg, setMsg] = useState('')
  const { t } = useI18n()
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://hdp-hot-meals.onrender.com'

  useEffect(() => {
    void apiJson<Status>('/api/admin/powerbi-key').then(setStatus).catch(() => setStatus(null))
  }, [])

  async function rotate() {
    if (status?.enabled && !window.confirm(ar ? 'سيتوقف المفتاح الحالي عن العمل. متابعة؟' : 'The current key will stop working. Continue?')) return
    try {
      const r = await apiJson<Status & { key: string }>('/api/admin/powerbi-key', { method: 'POST' })
      setNewKey(r.key)
      setStatus(r)
      setMsg('')
    } catch (err) {
      setMsg(explainError(t, err))
    }
  }
  async function revoke() {
    if (!window.confirm(ar ? 'إيقاف وصول Power BI؟' : 'Revoke Power BI access?')) return
    await apiJson('/api/admin/powerbi-key', { method: 'DELETE' })
    setNewKey('')
    setStatus({ enabled: false, createdAt: null, prefix: null })
  }

  const keyText = newKey || 'YOUR_KEY'
  return (
    <div className="grid gap-4">
      <Panel className="grid gap-3">
        <h3 className="text-lg font-bold text-ink">{ar ? 'ربط Power BI' : 'Power BI connection'}</h3>
        <p className="text-sm text-muted">
          {ar
            ? 'تغذية بيانات للقراءة فقط عبر مفتاح API. لا تشارك المفتاح؛ يمكنك تغييره أو إلغاؤه في أي وقت.'
            : 'Read-only data feed secured by an API key. Keep the key private; rotate or revoke it any time.'}
        </p>
        <p className="text-sm">
          {status?.enabled
            ? `${ar ? 'مفعّل — المفتاح يبدأ بـ' : 'Enabled — key starts with'} ${status.prefix}… (${status.createdAt?.slice(0, 16)})`
            : ar
              ? 'غير مفعّل'
              : 'Not enabled'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" tone="teal" onClick={() => void rotate()}>
            {status?.enabled ? (ar ? 'إنشاء مفتاح جديد' : 'Rotate key') : ar ? 'إنشاء مفتاح' : 'Generate key'}
          </Button>
          {status?.enabled ? (
            <Button type="button" tone="blocked" onClick={() => void revoke()}>
              {ar ? 'إلغاء الوصول' : 'Revoke'}
            </Button>
          ) : null}
        </div>
        {newKey ? (
          <Alert tone="warn">
            <p className="font-bold">{ar ? 'انسخ المفتاح الآن — لن يظهر مرة أخرى:' : 'Copy this key now — it will not be shown again:'}</p>
            <code className="mt-1 block break-all rounded bg-white p-2 text-xs" dir="ltr">
              {newKey}
            </code>
            <Button type="button" className="mt-2" onClick={() => void navigator.clipboard?.writeText(newKey)}>
              {ar ? 'نسخ' : 'Copy'}
            </Button>
          </Alert>
        ) : null}
        {msg ? <Alert tone="danger">{msg}</Alert> : null}
      </Panel>

      <Panel className="grid gap-3">
        <h3 className="font-bold text-ink">{ar ? 'الجداول المتاحة' : 'Available tables'}</h3>
        <ul className="grid gap-2 text-sm">
          {FEEDS.map((f) => (
            <li key={f.name} className="rounded-xl border border-line p-2">
              <p className="font-semibold">{ar ? f.ar : f.en}</p>
              <code className="block break-all text-xs text-muted" dir="ltr">
                {base}/api/powerbi/{f.name}?key={keyText}
              </code>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted" dir="ltr">
          Filters: &from=YYYY-MM-DD &to=YYYY-MM-DD &dp=MDF01 &district=Al-Mudhaffar|Al-Qahira &operator=USER_ID · CSV: add .csv to the table name (e.g. /api/powerbi/daily.csv?key=…)
        </p>
      </Panel>

      <Panel className="grid gap-2 text-sm">
        <h3 className="font-bold text-ink">{ar ? 'خطوات الربط في Power BI Desktop' : 'Connect in Power BI Desktop'}</h3>
        <ol className="list-decimal space-y-1 ps-5">
          {(ar
            ? [
                'Get data ← Web.',
                'اختر Basic والصق رابط الجدول (مثل daily) مع المفتاح.',
                'عند السؤال عن المصادقة اختر Anonymous.',
                'في Power Query: To Table ← Expand للأعمدة، ثم حدّد الأنواع (التاريخ والأرقام).',
                'كرّر لكل جدول واربطها عبر dp_code و hh_code و date.',
                'في Power BI Service: Dataset ← Scheduled refresh (مثلاً يومياً) — المصدر Anonymous.',
              ]
            : [
                'Get data → Web.',
                'Choose Basic and paste a table URL (e.g. daily) including the key.',
                'When asked for credentials choose Anonymous.',
                'In Power Query: To Table → expand the columns, then set types (dates, whole numbers).',
                'Repeat for each table; relate them on dp_code, hh_code and date.',
                'In Power BI Service: dataset → Scheduled refresh (e.g. daily) with Anonymous credentials.',
              ]
          ).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="text-xs text-muted">
          {ar
            ? 'ملاحظة: الخادم المجاني قد يستغرق دقيقة للاستيقاظ أول طلب؛ إن فشل التحديث أعد المحاولة.'
            : 'Note: on the free server plan the first request can take ~1 minute to wake up; retry if a refresh times out.'}
        </p>
      </Panel>
    </div>
  )
}
