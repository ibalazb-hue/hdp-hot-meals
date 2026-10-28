import { useEffect, useMemo, useState } from 'react'
import { normalizeHhCode } from '@hdp/rules'
import { apiJson } from '../api'
import { explainError } from '../errors'
import { chunkCards, QrCard } from '../components/QrCard'
import { Alert, Button, EmptyState, Field, PageHeader, Panel, SelectInput, TextInput } from '../components/ui'
import { useI18n } from '../i18n'

interface Household {
  hhCode: string
  dpCode: string
  beneficiaryCount: number
  label: string | null
  status: string
  activeCardCode: string | null
  payload?: string | null
  dpNameEn?: string | null
  dpNameAr?: string | null
  holderName?: string | null
  cardSerial?: string | null
  printBatch?: string | null
  validFrom?: string | null
  validTo?: string | null
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

interface DpOption {
  code: string
  nameEn: string
  nameAr: string
}

function cardProps(hh: Household) {
  return {
    hhCode: hh.hhCode,
    holderName: hh.holderName ?? hh.label,
    dpCode: hh.dpCode,
    dpNameEn: hh.dpNameEn,
    dpNameAr: hh.dpNameAr,
    validFrom: hh.validFrom,
    validTo: hh.validTo,
    cardSerial: hh.cardSerial ?? hh.activeCardCode,
    printBatch: hh.printBatch,
    beneficiaryCount: hh.beneficiaryCount,
    titleAr: hh.titleAr,
    projectTitleAr: hh.projectTitleAr,
    primaryColor: hh.primaryColor,
    showWfpLogo: hh.showWfpLogo,
    showHdpLogo: hh.showHdpLogo,
    wfpLogoDataUrl: hh.wfpLogoDataUrl,
    hdpLogoDataUrl: hh.hdpLogoDataUrl,
    complaintsHeadingAr: hh.complaintsHeadingAr,
    hotlineHeadingAr: hh.hotlineHeadingAr,
    hdpPanelTitleAr: hh.hdpPanelTitleAr,
    hdpPhone: hh.hdpPhone,
    hdpWhatsapp: hh.hdpWhatsapp,
    partnerPanelTitleAr: hh.partnerPanelTitleAr,
    partnerPhone: hh.partnerPhone,
    partnerWhatsapp: hh.partnerWhatsapp,
    reassuranceTextAr: hh.reassuranceTextAr,
    personalNoticeAr: hh.personalNoticeAr,
    showSerial: hh.showSerial,
    showBatch: hh.showBatch,
  }
}

export function CardsPage() {
  const { t, locale } = useI18n()
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<Household[]>([])
  const [selected, setSelected] = useState<Household | null>(null)
  const [dps, setDps] = useState<DpOption[]>([])
  const [editDp, setEditDp] = useState('')
  const [editLabel, setEditLabel] = useState('')
  const [editCount, setEditCount] = useState('1')
  const [saving, setSaving] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkPack, setBulkPack] = useState<Household[]>([])
  const [bulkActive, setBulkActive] = useState(false)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [tone, setTone] = useState<'ok' | 'danger'>('ok')
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    void apiJson<DpOption[]>('/api/dps')
      .then(setDps)
      .catch(() => setDps([]))
  }, [])

  const frontPages = useMemo(() => chunkCards(bulkPack, 3), [bulkPack])
  const backPages = useMemo(() => chunkCards(bulkPack, 3), [bulkPack])

  async function search() {
    const list = await apiJson<Household[]>(`/api/households?q=${encodeURIComponent(query)}`)
    setRows(list)
    setSearched(true)
  }

  async function open(hhCode: string) {
    const hh = await apiJson<Household>(`/api/households/${encodeURIComponent(hhCode)}`)
    setSelected(hh)
    setEditDp(hh.dpCode)
    setEditLabel(hh.label ?? '')
    setEditCount(String(hh.beneficiaryCount || 1))
    setMessage('')
    setBulkActive(false)
  }

  async function saveDetails() {
    if (!selected) return
    const count = Number(editCount)
    if (!Number.isInteger(count) || count < 1 || count > 30) {
      setTone('danger')
      setMessage(t('invalid_count'))
      return
    }
    setSaving(true)
    try {
      await apiJson(`/api/households/${encodeURIComponent(selected.hhCode)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          dpCode: editDp,
          label: editLabel.trim() ? editLabel.trim() : null,
          beneficiaryCount: count,
        }),
      })
      setTone('ok')
      setMessage(t('householdSaved'))
      await open(selected.hhCode)
      if (searched) await search()
    } catch (err) {
      setTone('danger')
      setMessage(explainError(t, err))
    } finally {
      setSaving(false)
    }
  }

  async function act(kind: 'void' | 'reissue') {
    if (!selected) return
    try {
      await apiJson(`/api/households/${selected.hhCode}/${kind}`, { method: 'POST', body: JSON.stringify({ reason }) })
      setTone('ok')
      setMessage(kind === 'void' ? t('voidedDone') : t('reissued'))
      await open(selected.hhCode)
    } catch (err) {
      setTone('danger')
      setMessage(explainError(t, err))
    }
  }

  async function bulkPrintAll() {
    setBulkLoading(true)
    setMessage('')
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set('q', query.trim())
      params.set('limit', '2000')
      const pack = await apiJson<Household[]>(`/api/households/print-pack?${params.toString()}`)
      if (pack.length === 0) {
        setTone('danger')
        setMessage(t('bulkPrintEmpty'))
        setBulkPack([])
        setBulkActive(false)
        return
      }
      setBulkPack(pack)
      setBulkActive(true)
      setSelected(null)
      setTone('ok')
      setMessage(t('bulkPrintReady').replace('{n}', String(pack.length)))
      // Wait a tick so React paints the sheet, then open the print dialog (Save as PDF).
      window.setTimeout(() => window.print(), 400)
    } catch (err) {
      setTone('danger')
      setMessage(explainError(t, err))
      setBulkActive(false)
    } finally {
      setBulkLoading(false)
    }
  }

  const dirty =
    selected &&
    (editDp !== selected.dpCode ||
      (editLabel.trim() || '') !== (selected.label ?? '') ||
      Number(editCount) !== selected.beneficiaryCount)

  return (
    <div className="grid gap-4">
      <div className="no-print">
        <PageHeader title={t('cards')} subtitle={t('tileCards')} />
      </div>
      <Panel className="no-print grid gap-3">
        <Field label={t('search')} hint={t('householdSearchHint')}>
          <TextInput data-testid="card-search" dir="ltr" value={query} onChange={(event) => setQuery(event.target.value)} />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            onClick={() => {
              setQuery((current) => (/[a-z]/i.test(current) && !/\s/.test(current) ? normalizeHhCode(current) : current))
              void search()
            }}
          >
            {t('search')}
          </Button>
          <Button
            type="button"
            tone="teal"
            data-testid="bulk-print-cards"
            disabled={bulkLoading}
            onClick={() => void bulkPrintAll()}
          >
            {bulkLoading ? t('loading') : t('bulkPrintPdf')}
          </Button>
        </div>
        <p className="text-xs text-muted">{t('bulkPrintHint')}</p>
        {searched && rows.length === 0 ? <EmptyState title={t('empty')} /> : null}
        <ul className="grid gap-2">
          {rows.map((row) => (
            <li key={row.hhCode}>
              <button
                className="flex min-h-14 w-full items-center justify-between rounded-2xl border border-line px-3 text-start hover:bg-mist"
                dir="ltr"
                onClick={() => void open(row.hhCode)}
              >
                <span>
                  <span className="font-mono font-semibold">{row.hhCode}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {row.dpCode}
                    {row.label ? ` · ${row.label}` : ''} · {t('beneficiaryCount')}: {row.beneficiaryCount}
                  </span>
                </span>
                <span className={`text-xs font-bold ${row.activeCardCode ? 'text-served' : 'text-blocked'}`}>
                  {row.activeCardCode ? t('active') : t('voided')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      {selected ? (
        <Panel className="grid gap-3">
          <div className="no-print grid gap-3">
            <p className="font-mono text-xl font-bold" dir="ltr">
              {selected.hhCode}
            </p>
            <p className="text-xs text-muted">{t('hhCodeFixedHint')}</p>
            <Field label={t('assignedDp')} hint={t('reassignDpHint')}>
              <SelectInput data-testid="hh-dp" value={editDp} onChange={(event) => setEditDp(event.target.value)}>
                {dps.map((dp) => (
                  <option key={dp.code} value={dp.code}>
                    {dp.code} — {locale === 'ar' ? dp.nameAr : dp.nameEn}
                  </option>
                ))}
                {!dps.some((dp) => dp.code === editDp) && editDp ? <option value={editDp}>{editDp}</option> : null}
              </SelectInput>
            </Field>
            <Field label={t('householdName')}>
              <TextInput
                data-testid="hh-label"
                value={editLabel}
                maxLength={80}
                onChange={(event) => setEditLabel(event.target.value)}
                placeholder={t('householdNameHint')}
              />
            </Field>
            <Field label={t('beneficiaryCount')}>
              <TextInput
                data-testid="hh-count"
                dir="ltr"
                inputMode="numeric"
                value={editCount}
                onChange={(event) => setEditCount(event.target.value.replace(/[^\d]/g, '').slice(0, 2))}
              />
            </Field>
            <Button data-testid="save-household" type="button" disabled={!dirty || saving || !editDp} onClick={() => void saveDetails()}>
              {saving ? t('loading') : t('saveHousehold')}
            </Button>
            <Field label={t('reason')}>
              <TextInput data-testid="card-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button data-testid="void-card" type="button" tone="blocked" disabled={reason.trim().length < 3 || !selected.activeCardCode} onClick={() => void act('void')}>
                {t('void')}
              </Button>
              <Button data-testid="reissue-card" type="button" disabled={reason.trim().length < 3} onClick={() => void act('reissue')}>
                {t('reissue')}
              </Button>
            </div>
          </div>
          {message ? <div className="no-print"><Alert tone={tone === 'ok' ? 'ok' : 'danger'}>{message}</Alert></div> : null}
          {selected.activeCardCode ? <QrCard {...cardProps(selected)} /> : null}
        </Panel>
      ) : message ? (
        <div className="no-print">
          <Alert tone={tone === 'ok' ? 'ok' : 'danger'}>{message}</Alert>
        </div>
      ) : null}

      <div className={`bulk-print-sheet${bulkActive ? ' is-active' : ''}`} aria-hidden={!bulkActive}>
        {frontPages.map((group, pageIndex) => (
          <div className="a4-page a4-fronts" key={`fronts-${pageIndex}`}>
            {group.map((hh) => (
              <QrCard key={`f-${hh.hhCode}`} {...cardProps(hh)} face="front" hidePrintButton />
            ))}
          </div>
        ))}
        {backPages.map((group, pageIndex) => (
          <div className="a4-page a4-backs" key={`backs-${pageIndex}`}>
            {group.map((hh) => (
              <QrCard key={`b-${hh.hhCode}`} {...cardProps(hh)} face="back" hidePrintButton />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
