import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { useAuth } from '../auth'
import { db, type LocalScan } from '../db'
import { useI18n, type CopyKey } from '../i18n'
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
  const [error, setError] = useState('')
  const [cameraError, setCameraError] = useState(false)
  const [reason, setReason] = useState('')
  const [pin, setPin] = useState('')
  const [torch, setTorch] = useState(false)
  const handler = useRef<(raw: string) => void>(() => undefined)
  const showing = useRef(false)
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
      } else setAssigned('')
    } catch (err) {
      setError(explainError(t, err))
    }
  }

  handler.current = (raw: string) => {
    if (showing.current) return
    const cardCode = readCard(raw)
    if (!cardCode) return
    void record(cardCode)
  }

  useEffect(() => {
    const qr = new Html5Qrcode('qr-reader')
    let alive = true
    qr.start({ facingMode: 'environment' }, { fps: 8, qrbox: { width: 220, height: 220 } }, (text) => handler.current(text), () => undefined).catch(
      () => {
        if (alive) setCameraError(true)
      },
    )
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
  const messageKey = (result?.messageKey ?? 'unknown') as CopyKey

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden pb-2">
      {result ? null : <PageHeader title={t('scan')} subtitle={t('tileScan')} />}
      {result ? (
        <div className="absolute inset-0 z-10 overflow-y-auto bg-canvas">
        <section
          ref={resultRef}
          data-testid="scan-result"
          className={`flex min-h-full flex-col rounded-2xl p-5 text-white shadow-lg ${counting ? 'bg-served' : 'bg-blocked'}`}
        >
          <p className="text-sm">{counting ? t('serveOne') : t('doNotServe')}</p>
          <h2 data-testid="result-title" className="text-4xl font-bold">
            {t(messageKey)}
          </h2>
          <p className="mt-2 text-end font-mono text-2xl" dir="ltr">
            {result.hhCode ?? result.cardCode}
          </p>
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
            }}
          >
            {t('nextHousehold')}
          </Button>
        </section>
        </div>
      ) : null}
      {dps.length > 1 ? (
        <Field label={t('dp')}>
          <SelectInput data-testid="dp" value={dp} onChange={(event) => setDp(event.target.value)}>
            {dps.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </SelectInput>
        </Field>
      ) : (
        <p className="font-bold" dir="ltr">
          {dp}
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-teal shadow-sm">
          <div id="qr-reader" className="min-h-0 flex-1" />
          <div className="p-3">
            <Button type="button" tone="sand" className="w-full" onClick={() => void toggleTorch()}>
              {t('torch')}
            </Button>
          </div>
        </div>
        <Panel>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              const field = event.currentTarget.elements.namedItem('card')
              const raw = field instanceof HTMLInputElement ? field.value : card
              const cardCode = readCard(raw)
              if (cardCode) void record(cardCode)
            }}
          >
            <Field label={t('cardCode')}>
              <TextInput name="card" data-testid="card-code" dir="ltr" value={card} onChange={(event) => setCard(event.target.value.toUpperCase())} autoCapitalize="characters" />
            </Field>
            <Button data-testid="card-submit" type="submit">
              {t('enterCard')}
            </Button>
          </form>
          {cameraError ? <p className="mt-3 text-sm text-warn">{t('cameraFailed')}</p> : null}
          {error ? <p className="mt-3 font-semibold text-blocked">{error}</p> : null}
        </Panel>
      </div>
    </div>
  )
}
