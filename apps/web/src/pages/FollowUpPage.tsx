import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adenDate } from '@hdp/rules'
import { apiJson } from '../api'
import { useI18n } from '../i18n'
import { Alert, Button, EmptyState, Field, PageHeader, Panel, ProgressBar, SelectInput, StatCard, TextInput } from '../components/ui'

interface Row {
  dpCode: string
  nameEn: string
  nameAr: string
  district: string
  dailyQuota: number | null
  quota: number | null
  served: number
  remaining: number | null
  achievement: number | null
  status: 'no_quota' | 'under' | 'met'
  households: number
  blocked: number
  prepared: number | null
  lastServedAt: string | null
}
interface Body {
  from: string
  to: string
  days: number
  rows: Row[]
  totals: { quota: number; served: number; remaining: number; achievement: number | null; needsAttention: number; households: number; blocked: number; prepared: number; withQuota: number }
}

const DISTRICT_AR: Record<string, string> = { 'Al-Qahira': 'القاهرة', 'Al-Mudhaffar': 'المظفر' }

const L = {
  ar: {
    title: 'المتابعة اليومية',
    subtitle: 'الحصة المحددة، ما تم صرفه، والكمية المتبقية لكل نقطة توزيع',
    from: 'من',
    to: 'إلى',
    today: 'اليوم',
    district: 'المديرية',
    dp: 'نقطة التوزيع',
    all: 'الكل',
    refresh: 'تحديث البيانات',
    totalQuota: 'إجمالي الحصة المحددة',
    served: 'إجمالي الصرف',
    servedHint: 'صرف مؤكد (مسح فريد)',
    attention: 'نقاط تحتاج متابعة',
    attentionHint: 'لم تكتمل حصتها',
    pct: 'نسبة الإنجاز',
    pctHint: 'من إجمالي الحصة',
    alert: (n: number) => `تنبيه متابعة: ${n} نقطة لم تصل إلى الحصة المحددة بعد. راجع الكمية المتبقية قبل إغلاق التوزيع.`,
    allMet: 'كل النقاط التي لها حصة وصلت إلى حصتها.',
    noQuotaSet: 'لم تُحدَّد حصة يومية لأي نقطة بعد. حدّدها من الإدارة ← نقاط التوزيع.',
    quota: 'الحصة المحددة',
    dispensed: 'المصروف',
    remaining: 'المتبقي',
    rate: 'نسبة الصرف من الحصة',
    households: 'الأسر',
    blocked: 'مرفوض',
    prepared: 'المحضّر',
    meals: 'وجبة',
    perDay: 'وجبة/يوم',
    days: 'يوم',
    under: 'تحتاج متابعة',
    met: 'مكتملة',
    none: 'بدون حصة',
    empty: 'لا توجد نقاط ضمن هذه الفلاتر',
    last: 'آخر صرف',
    adminLink: 'تعديل الحصص',
  },
  en: {
    title: 'Daily follow-up',
    subtitle: 'Quota, dispensed and remaining meals per distribution point',
    from: 'From',
    to: 'To',
    today: 'Today',
    district: 'District',
    dp: 'Distribution point',
    all: 'All',
    refresh: 'Refresh',
    totalQuota: 'Total quota',
    served: 'Total dispensed',
    servedHint: 'Confirmed unique scans',
    attention: 'Points needing attention',
    attentionHint: 'Below quota',
    pct: 'Achievement',
    pctHint: 'of total quota',
    alert: (n: number) => `Follow-up alert: ${n} point(s) have not reached their quota yet. Check remaining meals before closing.`,
    allMet: 'All points with a quota have reached it.',
    noQuotaSet: 'No daily quota set for any point yet. Set it in Admin → Distribution points.',
    quota: 'Quota',
    dispensed: 'Dispensed',
    remaining: 'Remaining',
    rate: 'Dispensed / quota',
    households: 'Households',
    blocked: 'Blocked',
    prepared: 'Prepared',
    meals: 'meals',
    perDay: 'meals/day',
    days: 'days',
    under: 'Needs follow-up',
    met: 'Complete',
    none: 'No quota',
    empty: 'No points match these filters',
    last: 'Last dispensed',
    adminLink: 'Edit quotas',
  },
}

function pctText(v: number | null): string {
  return v == null ? '—' : `${Math.round(v * 100)}%`
}

export function FollowUpPage() {
  const { locale } = useI18n()
  const c = locale === 'ar' ? L.ar : L.en
  const today = adenDate()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [district, setDistrict] = useState('')
  const [dp, setDp] = useState('')
  const [data, setData] = useState<Body | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const q = new URLSearchParams({ from, to })
      if (district) q.set('district', district)
      if (dp) q.set('dp', dp)
      setData(await apiJson<Body>(`/api/followup?${q.toString()}`))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [from, to, district, dp])

  useEffect(() => {
    void load()
  }, [load])

  const [allRows, setAllRows] = useState<Row[]>([])
  useEffect(() => {
    if (data && !dp && !district) setAllRows(data.rows)
  }, [data, dp, district])
  const dpOptions = (allRows.length ? allRows : data?.rows ?? []).filter((r) => !district || r.district === district)
  const t = data?.totals

  return (
    <div className="grid gap-4" data-testid="followup-page">
      <PageHeader
        title={c.title}
        subtitle={`${c.subtitle} — ${from === to ? from : `${from} → ${to}`}`}
        action={<Link to="/admin" className="text-sm font-semibold text-teal underline">{c.adminLink}</Link>}
      />
      <Panel>
        <div className="grid gap-3 sm:grid-cols-5">
          <Field label={c.from}>
            <TextInput type="date" dir="ltr" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={c.to}>
            <TextInput type="date" dir="ltr" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label={c.district}>
            <SelectInput value={district} onChange={(e) => { setDistrict(e.target.value); setDp('') }}>
              <option value="">{c.all}</option>
              <option value="Al-Qahira">{locale === 'ar' ? 'القاهرة' : 'Al-Qahira'}</option>
              <option value="Al-Mudhaffar">{locale === 'ar' ? 'المظفر' : 'Al-Mudhaffar'}</option>
            </SelectInput>
          </Field>
          <Field label={c.dp}>
            <SelectInput value={dp} onChange={(e) => setDp(e.target.value)}>
              <option value="">{c.all}</option>
              {dpOptions.map((r) => (
                <option key={r.dpCode} value={r.dpCode}>{r.dpCode} — {locale === 'ar' ? r.nameAr : r.nameEn}</option>
              ))}
            </SelectInput>
          </Field>
          <div className="flex items-end gap-2">
            <Button size="sm" tone="ghost" onClick={() => { setFrom(today); setTo(today) }}>{c.today}</Button>
            <Button size="sm" onClick={() => void load()} disabled={loading}>{c.refresh} ↻</Button>
          </div>
        </div>
      </Panel>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {t ? (
        t.withQuota === 0 ? (
          <Alert tone="info">{c.noQuotaSet}</Alert>
        ) : t.needsAttention > 0 ? (
          <Alert tone="warn"><span data-testid="followup-alert">{c.alert(t.needsAttention)}</span></Alert>
        ) : (
          <Alert tone="ok">{c.allMet}</Alert>
        )
      ) : null}

      {t ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={c.totalQuota} value={t.withQuota ? t.quota : '—'} tone="teal" hint={data && data.days > 1 ? `${data.days} ${c.days}` : undefined} />
          <StatCard label={c.served} value={t.served} tone="ok" hint={c.servedHint} />
          <StatCard label={c.attention} value={t.needsAttention} tone={t.needsAttention ? 'warn' : 'ok'} hint={c.attentionHint} />
          <StatCard label={c.pct} value={pctText(t.achievement)} tone={t.achievement != null && t.achievement >= 1 ? 'ok' : 'warn'} hint={c.pctHint} />
        </div>
      ) : null}

      {data && data.rows.length === 0 ? <EmptyState title={c.empty} /> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data?.rows.map((r) => {
          const badge =
            r.status === 'under'
              ? 'bg-amber/15 text-warn'
              : r.status === 'met'
                ? 'bg-served/15 text-served'
                : 'bg-mist text-muted'
          return (
            <Panel key={r.dpCode}>
              <div className="flex items-start justify-between gap-2" data-testid={`followup-dp-${r.dpCode}`}>
                <div className="min-w-0">
                  <p className="font-bold text-ink">⌖ {locale === 'ar' ? r.nameAr : r.nameEn}</p>
                  <p className="text-xs text-muted" dir="ltr">
                    {r.dpCode} · {locale === 'ar' ? DISTRICT_AR[r.district] ?? r.district : r.district}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${badge}`}>
                  {r.status === 'under' ? c.under : r.status === 'met' ? c.met : c.none}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-mist p-2">
                  <dt className="text-xs text-muted">{c.quota}</dt>
                  <dd className="tabular text-lg font-bold text-teal">{r.quota ?? '—'}</dd>
                </div>
                <div className="rounded-xl bg-mist p-2">
                  <dt className="text-xs text-muted">{c.dispensed}</dt>
                  <dd className="tabular text-lg font-bold text-served">{r.served}</dd>
                </div>
                <div className="rounded-xl bg-mist p-2">
                  <dt className="text-xs text-muted">{c.remaining}</dt>
                  <dd className="tabular text-lg font-bold text-ink">{r.remaining ?? '—'}</dd>
                </div>
              </dl>
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-muted">
                  <span>{c.rate}</span>
                  <span className="tabular font-bold text-ink">{pctText(r.achievement)}</span>
                </div>
                <ProgressBar ratio={r.achievement} alert={r.status === 'under' && (r.achievement ?? 0) < 0.5} />
              </div>
              <p className="mt-2 text-xs text-muted">
                {r.dailyQuota != null ? `${r.dailyQuota} ${c.perDay} · ` : ''}
                {c.households}: <span className="tabular">{r.households}</span> · {c.blocked}: <span className="tabular">{r.blocked}</span>
                {r.prepared != null ? <> · {c.prepared}: <span className="tabular">{r.prepared}</span></> : null}
              </p>
            </Panel>
          )
        })}
      </div>
    </div>
  )
}
