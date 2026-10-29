import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { useAuth } from '../auth'
import { db, type LocalScan } from '../db'
import { reasonLabel, useI18n } from '../i18n'
import { readCard, submitScan } from '../submit'
import { SupervisorNames } from '../components/SupervisorNames'
import { Button, Field, PageHeader, Panel, SelectInput, TextInput } from '../components/ui'
import { explainError } from '../errors'

function beep(ok: boolean) {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = ok ? 880 : 196
    gain.gain.value = 0.05
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + (ok ? 0.12 : 0.28))
  } catch {
    /* autoplay can be blocked until the first tap */
  }
}

export function ScanPage() {
  const { session } = useAuth()
  const { t } = useI18n()
  const dps = session?.user.dpCodes ?? []
  const [dp, setDp] = useState(() => localStorage.getItem('hdp-dp') || dps[0] || '')
  const [card, setCard] = useState('')
  const [result, setResult] = useState<LocalScan | null>(null)
  const [assigned, setAssigned] = useState('')
  const [members, setMembers] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [cameraError, setCameraError] = useState(false)
  const [reason, setReason] = useState('')
  const [pin, setPin] = useState('')
  const [torch, setTorch] = useState(false)
  const handler = useRef<(raw: string) => void>(() => undefined)
  const showing = useRef(false)
  const busy = useRef(false)
  const resultRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (dp) localStorage.setItem('hdp-dp', dp)
  }, [dp])

  useEffect(() => {
    showing.current = Boolean(result)
    if (result) resultRef.current?.scrollIntoView({ block: 'nearest' })
  }, [result])

  async function record(cardCode: string, override?: { reason: string; pin: string }) {
    setError('')
    try {
      const scan = await submitScan({
        mode: 'card',
        cardCode,
        dpCode: dp,
        overrideReason: override?.reason,
        supervisorPin: override?.pin,
      })
      setResult(scan)
      beep(scan.countsAsDistributed)
      if (scan.hhCode) {
        const household = await db.households.get(scan.hhCode)
        const point = household ? await db.dps.get(household.dpCode) : null
        setAssigned(point ? `${point.nameEn} / ${point.nameAr}` : household?.dpCode ?? '')
        setMembers(household?.beneficiaryCount && household.beneficiaryCount > 0 ? household.beneficiaryCount : null)
      } else {
        setAssigned('')
        setMembers(null)
      }
    } catch (err) {
      setError(explainError(t, err))
    }
  }

  handler.current = (raw: string) => {
    if (showing.current) return
    if (busy.current) return
    const cardCode = readCard(raw)
    if (!cardCode) {
      setError(t('unknown'))
      return
    }
    busy.current = true
    void record(cardCode).finally(() => {
      busy.current = false
    })
  }

  useEffect(() => {
    const qr = new Html5Qrcode('qr-reader')
    let alive = true
    qr.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        aspectRatio: 1,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.78)
          return { width: Math.max(240, edge), height: Math.max(240, edge) }
        },
      },
      (text) => handler.current(text),
      () => undefined,
    ).catch(() => {
      if (alive) setCameraError(true)
    })
    return () => {
      alive = false
      void qr.stop().catch(() => undefined)
    }
  }, [])

  async function toggleTorch() {
    const video = document.querySelector('#qr-reader video')
    const stream = video instanceof HTMLVideoElement ? video.srcObject : null
    const track = stream instanceof MediaStream ? stream.getVideoTracks()[0] : undefined
    if (!track) return
    const next = !torch
    await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints)
    setTorch(next)
  }

  const counting = result?.countsAsDistributed
  const rejectText = reasonLabel(t, result?.messageKey ?? result?.blockReason ?? 'unknown')

  return (
    <div className="relative flex min-h-full flex-1 flex-col gap-3 pb-1 sm:h-full sm:min-h-0 sm:gap-2 sm:overflow-hidden">
      {result ? null : <PageHeader title={t('scan')} subtitle={t('tileScan')} />}
      {result ? (
        <div className="absolute inset-0 z-10 overflow-y-auto bg-canvas">
        <section
          ref={resultRef}
          data-testid="scan-result"
          className={`flex min-h-full flex-col rounded-2xl p-5 text-white shadow-lg ${counting ? 'bg-served' : 'bg-blocked'}`}
        >
          <p className="text-sm">{counting ? t('serveOne') : t('doNotServe')}</p>
          <h2 data-testid="result-title" className="text-3xl font-bold leading-snug sm:text-4xl">
            {rejectText}
          </h2>
          {!counting && result?.blockReason ? (
            <p className="mt-1 text-sm text-white/85" data-testid="reject-detail">
              {t('rejectDetail')}: {reasonLabel(t, result.blockReason)}
            </p>
          ) : null}
          <p className="mt-2 text-end font-mono text-2xl" dir="ltr">
            {result.hhCode ?? result.cardCode}
          </p>
          {members != null ? (
            <p className="text-lg font-semibold" data-testid="scan-members">
              {t('beneficiaryCount')}: {members}
            </p>
          ) : null}
          {assigned ? (
            <p>
              {t('assignedDp')}: {assigned}
            </p>
          ) : null}
          <p className="text-end" dir="ltr" data-testid="scan-location">
            {result.latitude != null && result.longitude != null
              ? `${result.latitude.toFixed(5)}, ${result.longitude.toFixed(5)}${result.locationAccuracyM != null ? ` ±${Math.round(result.locationAccuracyM)} m` : ''}`
              : t('noLocation')}
          </p>
          {result.blockReason === 'wrong_dp' ? (
            <form
              className="mt-3 grid gap-2 text-ink"
              onSubmit={(event) => {
                event.preventDefault()
                void record(result.cardCode ?? card, { reason, pin })
              }}
            >
              <p className="font-bold text-white">{t('overrideTitle')}</p>
              {session?.user.role === 'dp_focal' ? (
                <div className="text-white">
                  <SupervisorNames />
                </div>
              ) : null}
              <TextInput value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('reason')} />
              <TextInput value={pin} onChange={(event) => setPin(event.target.value)} inputMode="numeric" placeholder={t('pin')} dir="ltr" />
              <Button type="submit" tone="sand">
                {t('submit')}
              </Button>
            </form>
          ) : null}
          <Button
            className="mt-auto w-full"
            tone="sand"
            onClick={() => {
              setResult(null)
              setCard('')
              setReason('')
              setPin('')
              setMembers(null)
              setAssigned('')
            }}
          >
            {t('nextHousehold')}
          </Button>
        </section>
        </div>
      ) : null}
      <div className="flex shrink-0 items-center gap-2">
        {dps.length > 1 ? (
          <SelectInput data-testid="dp" className="min-h-10 flex-1 text-sm font-semibold" value={dp} onChange={(event) => setDp(event.target.value)}>
            {dps.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </SelectInput>
        ) : (
          <p className="flex-1 rounded-xl bg-mist px-3 py-2 text-sm font-bold text-teal" dir="ltr">
            {dp}
          </p>
        )}
        <Button type="button" tone="sand" size="sm" className="shrink-0" onClick={() => void toggleTorch()}>
          {t('torch')}
        </Button>
      </div>
      <div className="flex flex-1 flex-col gap-3 sm:min-h-0 sm:gap-2 sm:overflow-hidden">
        <div className="scan-stage flex aspect-square max-h-[60dvh] min-h-[16rem] w-full flex-col overflow-hidden rounded-2xl bg-teal shadow-sm sm:aspect-auto sm:max-h-none sm:flex-1 sm:min-h-[min(72dvh,36rem)]">
          <div id="qr-reader" className="min-h-0 flex-1" data-testid="qr-stage" />
        </div>
        <Panel className="shrink-0 !p-3">
          <form
            className="grid grid-cols-[1fr_auto] gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              const field = event.currentTarget.elements.namedItem('card')
              const raw = field instanceof HTMLInputElement ? field.value : card
              const cardCode = readCard(raw)
              if (cardCode) void record(cardCode)
              else setError(t('unknown'))
            }}
          >
            <TextInput
              name="card"
              data-testid="card-code"
              dir="ltr"
              value={card}
              onChange={(event) => setCard(event.target.value.toUpperCase())}
              autoCapitalize="characters"
              placeholder={t('cardCode')}
              aria-label={t('cardCode')}
            />
            <Button data-testid="card-submit" type="submit" size="sm">
              {t('enterCard')}
            </Button>
          </form>
          {cameraError ? <p className="mt-2 text-sm text-warn">{t('cameraFailed')}</p> : null}
          {error ? <p className="mt-2 font-semibold text-blocked">{error}</p> : null}
        </Panel>
      </div>
    </div>
  )
}
