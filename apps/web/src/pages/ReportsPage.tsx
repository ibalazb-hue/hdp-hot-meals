import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { adenDate } from '@hdp/rules'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { apiJson } from '../api'
import { explainError } from '../errors'
import { useI18n } from '../i18n'
import { Alert, Button, EmptyState, Field, PageHeader, Panel, SelectInput, TextInput } from '../components/ui'

interface DpRow {
  dpCode: string
  nameEn: string
  nameAr: string
  district: string
  activeCards: number
  people: number
  productionDays: number
  prepared: number | null
  served: number
  variance: number | null
  blocked: number
  overrides: number
  manual: number
  offline: number
  scans: number
  uniqueHh: number
  issued: number
  voided: number
  reissued: number
}
interface ReportData {
  options: {
    dps: Array<{ code: string; nameEn: string; nameAr: string; district: string }>
    districts: string[]
    operators: Array<{ id: string; name: string; role: string }>
  }
  totals: {
    activeCards: number
    people: number
    prepared: number | null
    served: number
    variance: number | null
    coveragePct: number | null
    blocked: number
    overrides: number
    manual: number
    offline: number
    scans: number
    uniqueHh: number
    activeDps: number
    totalDps: number
    issued: number
    voided: number
    reissued: number
    days: number
  }
  byDay: Array<{ date: string; prepared: number | null; served: number; variance: number | null; blocked: number; overrides: number; uniqueHh: number }>
  byDp: DpRow[]
  byDistrict: Array<{ district: string; dps: number; activeCards: number; prepared: number | null; served: number; variance: number | null; blocked: number; overrides: number; voided: number; reissued: number }>
  byOperator: Array<{ id: string; name: string; role: string; served: number; blocked: number; overrides: number; manual: number; offline: number; scans: number }>
  blockReasons: Array<{ reason: string; count: number }>
}

const L = {
  en: {
    title: 'MEAL reports',
    subtitle: 'Prepared vs served, coverage and exceptions across distribution points',
    from: 'From',
    to: 'To',
    district: 'District',
    dp: 'Distribution point',
    focal: 'Focal point / supervisor',
    all: 'All',
    apply: 'Apply',
    today: 'Today',
    d7: 'Last 7 days',
    d30: 'Last 30 days',
    d90: 'Last 90 days',
    prepared: 'Meals prepared',
    served: 'Meals served',
    variance: 'Variance (prepared − served)',
    coverage: 'Served / prepared',
    uniqueHh: 'Unique households served',
    activeDps: 'Active DPs',
    activeCards: 'Active cards',
    people: 'Beneficiaries on cards',
    blocked: 'Blocked scans',
    overrides: 'Supervisor overrides',
    manual: 'Manual exceptions',
    offline: 'Offline scans',
    voids: 'Cards voided',
    reissues: 'Cards reissued',
    issued: 'Cards issued',
    trend: 'Daily trend — prepared vs served',
    byDp: 'Prepared vs served by distribution point',
    byDistrict: 'Served by district',
    byFocal: 'Meals served by focal point',
    blockReasons: 'Blocked scan reasons',
    tableDp: 'Distribution point detail',
    tableFocal: 'Focal point detail',
    tableDay: 'Daily register summary',
    tableDistrict: 'District summary',
    search: 'Filter rows…',
    exportCsv: 'Export Excel (CSV)',
    exportAll: 'Export full report',
    loading: 'Loading…',
    noData: 'No data for these filters',
    noDataBody: 'Widen the date range or clear filters.',
    date: 'Date',
    name: 'Name',
    role: 'Role',
    scans: 'Scans',
    days: 'Production days',
    dps: 'DPs',
    notEntered: 'not entered',
    perDay: 'per day avg',
    printView: 'Print / PDF',
  },
  ar: {
    title: 'تقارير المتابعة والتقييم',
    subtitle: 'الوجبات المحضّرة مقابل الموزّعة والتغطية والاستثناءات عبر نقاط التوزيع',
    from: 'من',
    to: 'إلى',
    district: 'المديرية',
    dp: 'نقطة التوزيع',
    focal: 'ضابط الارتباط / المشرف',
    all: 'الكل',
    apply: 'تطبيق',
    today: 'اليوم',
    d7: 'آخر ٧ أيام',
    d30: 'آخر ٣٠ يوماً',
    d90: 'آخر ٩٠ يوماً',
    prepared: 'الوجبات المحضّرة',
    served: 'الوجبات الموزّعة',
    variance: 'الفرق (محضّر − موزّع)',
    coverage: 'نسبة التوزيع من المحضّر',
    uniqueHh: 'الأسر المستفيدة (فريدة)',
    activeDps: 'النقاط النشطة',
    activeCards: 'البطاقات النشطة',
    people: 'الأفراد في البطاقات',
    blocked: 'المسح المرفوض',
    overrides: 'تجاوزات المشرف',
    manual: 'استثناءات يدوية',
    offline: 'مسح دون اتصال',
    voids: 'بطاقات ملغاة',
    reissues: 'بطاقات أعيد إصدارها',
    issued: 'بطاقات صادرة',
    trend: 'الاتجاه اليومي — المحضّر مقابل الموزّع',
    byDp: 'المحضّر مقابل الموزّع حسب نقطة التوزيع',
    byDistrict: 'الموزّع حسب المديرية',
    byFocal: 'الوجبات الموزّعة حسب ضابط الارتباط',
    blockReasons: 'أسباب رفض المسح',
    tableDp: 'تفاصيل نقاط التوزيع',
    tableFocal: 'تفاصيل ضباط الارتباط',
    tableDay: 'ملخص السجل اليومي',
    tableDistrict: 'ملخص المديريات',
    search: 'تصفية الصفوف…',
    exportCsv: 'تصدير Excel (CSV)',
    exportAll: 'تصدير التقرير كاملاً',
    loading: 'جارٍ التحميل…',
    noData: 'لا توجد بيانات لهذه الفلاتر',
    noDataBody: 'وسّع نطاق التاريخ أو امسح الفلاتر.',
    date: 'التاريخ',
    name: 'الاسم',
    role: 'الدور',
    scans: 'عمليات المسح',
    days: 'أيام الإنتاج',
    dps: 'النقاط',
    notEntered: 'غير مُدخل',
    perDay: 'متوسط يومي',
    printView: 'طباعة / PDF',
  },
} as const

type Labels = { [K in keyof (typeof L)['en']]: string }

const DISTRICT_AR: Record<string, string> = { 'Al-Mudhaffar': 'المظفر', 'Al-Qahira': 'القاهرة' }
const COLORS = { prepared: '#0a3540', served: '#157484', variance: '#b45309', blocked: '#9f1a3a', ok: '#0a7340' }
const PIE = ['#157484', '#0a3540', '#b45309', '#0369a1', '#0a7340']

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const fmt = (n: number | null | undefined, locale: string) =>
  n == null ? '—' : n.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US')

function downloadCsv(filename: string, header: string[], rows: Array<Array<unknown>>) {
  const cell = (v: unknown) => {
    if (v == null) return ''
    const s = String(v)
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  const body = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')
  // BOM so Excel opens Arabic text correctly
  const blob = new Blob(['\ufeff' + body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Kpi({ label, value, hint, tone = 'ink' }: { label: string; value: string; hint?: string; tone?: 'ink' | 'teal' | 'ok' | 'warn' | 'danger' }) {
  const color = { ink: 'text-ink', teal: 'text-teal', ok: 'text-served', warn: 'text-warn', danger: 'text-blocked' }[tone]
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)]">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`tabular mt-1 text-2xl font-bold sm:text-3xl ${color}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

function ChartCard({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Panel className="grid min-w-0 gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        {action}
      </div>
      <div className="h-72 w-full" dir="ltr">
        {children}
      </div>
    </Panel>
  )
}

interface Col<T> {
  key: string
  label: string
  get: (row: T) => string | number | null
  numeric?: boolean
  render?: (row: T) => ReactNode
}

function DataTable<T>({
  title,
  rows,
  cols,
  labels,
  csvName,
  locale,
}: {
  title: string
  rows: T[]
  cols: Array<Col<T>>
  labels: Labels
  csvName: string
  locale: string
}) {
  const [sortKey, setSortKey] = useState(cols[0]?.key ?? '')
  const [desc, setDesc] = useState(false)
  const [q, setQ] = useState('')
  const sorted = useMemo(() => {
    const col = cols.find((c) => c.key === sortKey)
    const needle = q.trim().toLowerCase()
    const filtered = needle
      ? rows.filter((r) => cols.some((c) => String(c.get(r) ?? '').toLowerCase().includes(needle)))
      : rows
    if (!col) return filtered
    return [...filtered].sort((a, b) => {
      const va = col.get(a)
      const vb = col.get(b)
      const cmp =
        typeof va === 'number' || typeof vb === 'number'
          ? Number(va ?? -Infinity) - Number(vb ?? -Infinity)
          : String(va ?? '').localeCompare(String(vb ?? ''))
      return desc ? -cmp : cmp
    })
  }, [rows, cols, sortKey, desc, q])
  return (
    <Panel className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="h-9 rounded-xl border border-line bg-white px-3 text-sm"
            placeholder={labels.search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            type="button"
            className="h-9 rounded-xl border border-teal px-3 text-sm font-bold text-teal hover:bg-mist"
            onClick={() =>
              downloadCsv(
                csvName,
                cols.map((c) => c.label),
                sorted.map((r) => cols.map((c) => c.get(r))),
              )
            }
          >
            {labels.exportCsv}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead className="bg-mist text-xs text-muted">
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 font-bold ${c.numeric ? 'text-end' : 'text-start'}`}
                  onClick={() => {
                    if (sortKey === c.key) setDesc(!desc)
                    else {
                      setSortKey(c.key)
                      setDesc(Boolean(c.numeric))
                    }
                  }}
                >
                  {c.label}
                  {sortKey === c.key ? (desc ? ' ▼' : ' ▲') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i} className="border-t border-line odd:bg-white even:bg-canvas">
                {cols.map((c) => (
                  <td key={c.key} className={`whitespace-nowrap px-3 py-2 ${c.numeric ? 'tabular text-end' : 'text-start'}`}>
                    {c.render ? c.render(r) : c.numeric ? fmt(c.get(r) as number | null, locale) : (c.get(r) ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function VarianceBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted">—</span>
  const tone = value === 0 ? 'bg-served/15 text-served' : value > 0 ? 'bg-amber/15 text-warn' : 'bg-blocked/10 text-blocked'
  return <span className={`tabular inline-block rounded-full px-2 py-0.5 text-xs font-bold ${tone}`}>{value > 0 ? `+${value}` : value}</span>
}

export function ReportsPage() {
  const { t, locale } = useI18n()
  const lb: Labels = locale === 'ar' ? L.ar : L.en
  const today = adenDate()
  const [from, setFrom] = useState(shiftDate(today, -6))
  const [to, setTo] = useState(today)
  const [district, setDistrict] = useState('')
  const [dp, setDp] = useState('')
  const [operator, setOperator] = useState('')
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(
    async (f = from, tt = to) => {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams({ from: f, to: tt })
        if (district) params.set('district', district)
        if (dp) params.set('dp', dp)
        if (operator) params.set('operator', operator)
        setData(await apiJson<ReportData>(`/api/reports?${params.toString()}`))
      } catch (err) {
        setError(explainError(t, err))
      } finally {
        setLoading(false)
      }
    },
    [from, to, district, dp, operator, t],
  )

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [district, dp, operator])

  function preset(days: number) {
    const f = shiftDate(today, -(days - 1))
    setFrom(f)
    setTo(today)
    void load(f, today)
  }

  const dpName = useCallback((r: { nameAr: string; nameEn: string; dpCode?: string }) => (locale === 'ar' ? r.nameAr : r.nameEn), [locale])
  const distName = useCallback((d: string) => (locale === 'ar' ? DISTRICT_AR[d] ?? d : d), [locale])
  const dpOptions = (data?.options.dps ?? []).filter((o) => !district || o.district === district)
  const tt = data?.totals
  const empty = tt && tt.scans === 0 && tt.prepared == null

  const dayChart = (data?.byDay ?? []).map((d) => ({ ...d, label: d.date.slice(5) }))
  const dpChart = (data?.byDp ?? []).map((r) => ({ name: r.dpCode, prepared: r.prepared ?? 0, served: r.served, variance: r.variance ?? 0 }))
  const distChart = (data?.byDistrict ?? []).map((r) => ({ name: distName(r.district), value: r.served }))
  const opChart = (data?.byOperator ?? []).slice(0, 12).map((r) => ({ name: r.name, served: r.served, blocked: r.blocked }))
  const reasonChart = (data?.blockReasons ?? []).map((r) => ({ name: r.reason, count: r.count }))

  function exportAll() {
    if (!data) return
    const rows: Array<Array<unknown>> = []
    rows.push(['Report', `${from} → ${to}`], [])
    rows.push(['KPI', 'Value'])
    for (const [k, v] of Object.entries(data.totals)) rows.push([k, v])
    rows.push([], ['DP', 'Name EN', 'Name AR', 'District', 'Prepared', 'Served', 'Variance', 'Unique HH', 'Blocked', 'Overrides', 'Manual', 'Offline', 'Active cards', 'Voided', 'Reissued'])
    for (const r of data.byDp)
      rows.push([r.dpCode, r.nameEn, r.nameAr, r.district, r.prepared, r.served, r.variance, r.uniqueHh, r.blocked, r.overrides, r.manual, r.offline, r.activeCards, r.voided, r.reissued])
    rows.push([], ['Date', 'Prepared', 'Served', 'Variance', 'Unique HH', 'Blocked', 'Overrides'])
    for (const d of data.byDay) rows.push([d.date, d.prepared, d.served, d.variance, d.uniqueHh, d.blocked, d.overrides])
    rows.push([], ['Focal point', 'Role', 'Served', 'Blocked', 'Overrides', 'Manual', 'Offline', 'Scans'])
    for (const o of data.byOperator) rows.push([o.name, o.role, o.served, o.blocked, o.overrides, o.manual, o.offline, o.scans])
    downloadCsv(`hdp-meal-report-${from}_${to}.csv`, [], rows)
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        title={lb.title}
        subtitle={lb.subtitle}
        action={
          <div className="no-print flex gap-2">
            <Button type="button" tone="teal" disabled={!data} onClick={exportAll}>
              {lb.exportAll}
            </Button>
          </div>
        }
      />

      <Panel className="no-print grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label={lb.from}>
            <TextInput type="date" dir="ltr" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={lb.to}>
            <TextInput type="date" dir="ltr" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label={lb.district}>
            <SelectInput
              value={district}
              onChange={(e) => {
                setDistrict(e.target.value)
                setDp('')
              }}
            >
              <option value="">{lb.all}</option>
              {(data?.options.districts ?? []).map((d) => (
                <option key={d} value={d}>
                  {distName(d)}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label={lb.dp}>
            <SelectInput value={dp} onChange={(e) => setDp(e.target.value)}>
              <option value="">{lb.all}</option>
              {dpOptions.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.code} — {locale === 'ar' ? o.nameAr : o.nameEn}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label={lb.focal}>
            <SelectInput value={operator} onChange={(e) => setOperator(e.target.value)}>
              <option value="">{lb.all}</option>
              {(data?.options.operators ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            [1, lb.today],
            [7, lb.d7],
            [30, lb.d30],
            [90, lb.d90],
          ].map(([n, label]) => (
            <button
              key={String(n)}
              type="button"
              className="h-9 rounded-full border border-line bg-white px-3 text-sm font-semibold text-ink hover:bg-mist"
              onClick={() => preset(Number(n))}
            >
              {label}
            </button>
          ))}
          <Button type="button" className="ms-auto" disabled={loading} onClick={() => void load()}>
            {loading ? lb.loading : lb.apply}
          </Button>
        </div>
      </Panel>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {tt ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label={lb.prepared} value={fmt(tt.prepared, locale)} tone="teal" hint={tt.prepared == null ? lb.notEntered : `${fmt(Math.round(tt.prepared / Math.max(1, tt.days)), locale)} ${lb.perDay}`} />
            <Kpi label={lb.served} value={fmt(tt.served, locale)} tone="ok" hint={`${fmt(Math.round(tt.served / Math.max(1, tt.days)), locale)} ${lb.perDay}`} />
            <Kpi label={lb.variance} value={fmt(tt.variance, locale)} tone={tt.variance == null ? 'ink' : tt.variance === 0 ? 'ok' : tt.variance > 0 ? 'warn' : 'danger'} />
            <Kpi label={lb.coverage} value={tt.coveragePct == null ? '—' : `${tt.coveragePct}%`} tone="teal" />
            <Kpi label={lb.uniqueHh} value={fmt(tt.uniqueHh, locale)} hint={`${lb.activeCards}: ${fmt(tt.activeCards, locale)}`} />
            <Kpi label={lb.activeDps} value={`${fmt(tt.activeDps, locale)} / ${fmt(tt.totalDps, locale)}`} />
            <Kpi label={lb.people} value={fmt(tt.people, locale)} />
            <Kpi label={lb.blocked} value={fmt(tt.blocked, locale)} tone={tt.blocked ? 'danger' : 'ink'} />
            <Kpi label={lb.overrides} value={fmt(tt.overrides, locale)} tone={tt.overrides ? 'warn' : 'ink'} />
            <Kpi label={lb.offline} value={fmt(tt.offline, locale)} />
            <Kpi label={lb.voids} value={fmt(tt.voided, locale)} tone={tt.voided ? 'danger' : 'ink'} />
            <Kpi label={lb.reissues} value={fmt(tt.reissued, locale)} hint={`${lb.issued}: ${fmt(tt.issued, locale)}`} />
          </div>

          {empty ? (
            <EmptyState title={lb.noData} body={lb.noDataBody} />
          ) : (
            <>
              <ChartCard title={lb.trend}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dayChart} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d0dcd9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="prepared" name={lb.prepared} fill="#0a354022" stroke={COLORS.prepared} strokeWidth={2} />
                    <Line type="monotone" dataKey="served" name={lb.served} stroke={COLORS.served} strokeWidth={3} dot={false} />
                    <Bar dataKey="blocked" name={lb.blocked} fill={COLORS.blocked} barSize={8} />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <ChartCard title={lb.byDp}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dpChart} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#d0dcd9" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="prepared" name={lb.prepared} fill={COLORS.prepared} radius={[4, 4, 0, 0]} />
                        <Bar dataKey="served" name={lb.served} fill={COLORS.served} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>
                <ChartCard title={lb.byDistrict}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={distChart} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} label>
                        {distChart.map((_, i) => (
                          <Cell key={i} fill={PIE[i % PIE.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard title={lb.byFocal}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={opChart} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#d0dcd9" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="served" name={lb.served} stackId="a" fill={COLORS.ok} />
                      <Bar dataKey="blocked" name={lb.blocked} stackId="a" fill={COLORS.blocked} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title={lb.blockReasons}>
                  {reasonChart.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reasonChart} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#d0dcd9" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" name={lb.blocked} fill={COLORS.variance} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted">—</div>
                  )}
                </ChartCard>
              </div>
            </>
          )}

          <DataTable<DpRow>
            title={lb.tableDp}
            rows={data!.byDp}
            labels={lb}
            locale={locale}
            csvName={`hdp-dp-report-${from}_${to}.csv`}
            cols={[
              { key: 'dp', label: lb.dp, get: (r) => `${r.dpCode} — ${dpName(r)}` },
              { key: 'district', label: lb.district, get: (r) => distName(r.district) },
              { key: 'prepared', label: lb.prepared, get: (r) => r.prepared, numeric: true },
              { key: 'served', label: lb.served, get: (r) => r.served, numeric: true },
              { key: 'variance', label: lb.variance, get: (r) => r.variance, numeric: true, render: (r) => <VarianceBadge value={r.variance} /> },
              { key: 'uniq', label: lb.uniqueHh, get: (r) => r.uniqueHh, numeric: true },
              { key: 'cards', label: lb.activeCards, get: (r) => r.activeCards, numeric: true },
              { key: 'blocked', label: lb.blocked, get: (r) => r.blocked, numeric: true },
              { key: 'ovr', label: lb.overrides, get: (r) => r.overrides, numeric: true },
              { key: 'off', label: lb.offline, get: (r) => r.offline, numeric: true },
              { key: 'void', label: lb.voids, get: (r) => r.voided, numeric: true },
              { key: 're', label: lb.reissues, get: (r) => r.reissued, numeric: true },
            ]}
          />

          <div className="grid gap-4 xl:grid-cols-2">
            <DataTable
              title={lb.tableDistrict}
              rows={data!.byDistrict}
              labels={lb}
              locale={locale}
              csvName={`hdp-district-report-${from}_${to}.csv`}
              cols={[
                { key: 'district', label: lb.district, get: (r) => distName(r.district) },
                { key: 'dps', label: lb.dps, get: (r) => r.dps, numeric: true },
                { key: 'prepared', label: lb.prepared, get: (r) => r.prepared, numeric: true },
                { key: 'served', label: lb.served, get: (r) => r.served, numeric: true },
                { key: 'variance', label: lb.variance, get: (r) => r.variance, numeric: true, render: (r) => <VarianceBadge value={r.variance} /> },
                { key: 'blocked', label: lb.blocked, get: (r) => r.blocked, numeric: true },
                { key: 'void', label: lb.voids, get: (r) => r.voided, numeric: true },
              ]}
            />
            <DataTable
              title={lb.tableFocal}
              rows={data!.byOperator}
              labels={lb}
              locale={locale}
              csvName={`hdp-focal-report-${from}_${to}.csv`}
              cols={[
                { key: 'name', label: lb.name, get: (r) => r.name },
                { key: 'role', label: lb.role, get: (r) => r.role },
                { key: 'served', label: lb.served, get: (r) => r.served, numeric: true },
                { key: 'blocked', label: lb.blocked, get: (r) => r.blocked, numeric: true },
                { key: 'ovr', label: lb.overrides, get: (r) => r.overrides, numeric: true },
                { key: 'off', label: lb.offline, get: (r) => r.offline, numeric: true },
                { key: 'scans', label: lb.scans, get: (r) => r.scans, numeric: true },
              ]}
            />
          </div>

          <DataTable
            title={lb.tableDay}
            rows={data!.byDay}
            labels={lb}
            locale={locale}
            csvName={`hdp-daily-report-${from}_${to}.csv`}
            cols={[
              { key: 'date', label: lb.date, get: (r) => r.date },
              { key: 'prepared', label: lb.prepared, get: (r) => r.prepared, numeric: true },
              { key: 'served', label: lb.served, get: (r) => r.served, numeric: true },
              { key: 'variance', label: lb.variance, get: (r) => r.variance, numeric: true, render: (r) => <VarianceBadge value={r.variance} /> },
              { key: 'uniq', label: lb.uniqueHh, get: (r) => r.uniqueHh, numeric: true },
              { key: 'blocked', label: lb.blocked, get: (r) => r.blocked, numeric: true },
              { key: 'ovr', label: lb.overrides, get: (r) => r.overrides, numeric: true },
            ]}
          />
        </>
      ) : loading ? (
        <Panel>
          <p className="text-sm text-muted">{lb.loading}</p>
        </Panel>
      ) : null}
    </div>
  )
}
