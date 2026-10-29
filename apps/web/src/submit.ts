import {
  adenDate,
  checkGeofence,
  decideScan,
  parseCardPayload,
  resolveArrival,
  verifySecret,
  type BlockReason,
  type ScanResult,
} from '@hdp/rules'
import { api, ApiError } from './api'
import { db, deviceId, forgetServed, getSession, rememberServed, type LocalScan, type Session } from './db'

export interface ScanRequest {
  mode: 'card' | 'manual'
  cardCode?: string | null
  hhCode?: string | null
  dpCode: string
  overrideReason?: string | null
  supervisorPin?: string | null
}

export interface BundleHousehold {
  hhCode: string
  dpCode: string
  status: 'active' | 'inactive'
  activeCardCode: string | null
  beneficiaryCount: number
}

interface ServerScan {
  id: string
  hhCode: string | null
  cardCode: string | null
  dpCode: string
  scanDate: string
  mode: 'card' | 'manual'
  clientResult: ScanResult
  result: ScanResult
  blockReason: BlockReason | null
  countsAsDistributed: boolean
  conflictNote: string | null
  messageKey: string
  scannedAt: string
  offlineFlag: boolean
  latitude: number | null
  longitude: number | null
  locationAccuracyM: number | null
}

export interface ScanLocation {
  latitude: number
  longitude: number
  accuracy: number
}

/** One fix at scan time. A missing fix does not block the meal. */
export function captureLocation(timeoutMs = 4000): Promise<ScanLocation | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: ScanLocation | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => finish(null), timeoutMs + 500)
    navigator.geolocation.getCurrentPosition(
      (position) =>
        finish({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      () => finish(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    )
  })
}

function notify(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('hdp-sync'))
}

async function pinMatches(pin: string | null | undefined): Promise<boolean> {
  if (!pin) return false
  const pins = await db.pins.toArray()
  return pins.some((row) => verifySecret(pin, row.pinHash))
}

async function localDecision(input: ScanRequest, clientScanId: string, scannedAt: string, authorized: boolean) {
  let household: BundleHousehold | null = null
  let knownVoided = false
  let cardCode = input.cardCode?.trim().toUpperCase() || null
  const hhCode = input.hhCode?.trim().toUpperCase() || null
  if (input.mode === 'card' && cardCode) {
    household = (await db.households.where('activeCardCode').equals(cardCode).first()) ?? null
    if (!household) {
      const voided = await db.voidedCards.get(cardCode)
      if (voided) {
        knownVoided = true
        household = (await db.households.get(voided.hhCode)) ?? null
      }
    }
    if (!household) {
      household = (await db.households.get(cardCode)) ?? null
      if (household?.activeCardCode) cardCode = household.activeCardCode
    }
  } else if (hhCode) {
    household = (await db.households.get(hhCode)) ?? null
  }
  const scanDate = adenDate(scannedAt)
  const existing = household ? await db.served.get(`${household.hhCode}|${scanDate}`) : null
  let decision = decideScan({
    clientScanId,
    mode: input.mode,
    cardCode,
    dpCode: input.dpCode,
    household,
    knownVoided,
    existingSuccess: null,
    supervisorAuthorized: authorized,
  })
  if (decision.countsAsDistributed && existing && existing.clientScanId !== clientScanId) {
    decision = resolveArrival(decision, { clientScanId: existing.clientScanId, scannedAt: existing.scannedAt, result: 'Served' }, {
      clientScanId,
      scannedAt,
    })
  }
  return { decision, cardCode, scanDate }
}

function toLocal(
  session: Session,
  input: ScanRequest,
  id: string,
  scannedAt: string,
  scanDate: string,
  cardCode: string | null,
  clientResult: ScanResult,
  decision: { result: ScanResult; blockReason: BlockReason | null; countsAsDistributed: boolean; hhCode: string | null; messageKey: string; conflictNote: string | null },
  synced: 0 | 1,
  offlineFlag: boolean,
  device: string,
  location: { latitude: number | null; longitude: number | null; locationAccuracyM: number | null },
): LocalScan {
  return {
    id,
    hhCode: decision.hhCode,
    cardCode,
    dpCode: input.dpCode,
    scanDate,
    scannedAt,
    mode: input.mode,
    clientResult,
    clientBlockReason: clientResult === 'Blocked' ? decision.blockReason : null,
    result: decision.result,
    blockReason: decision.blockReason,
    countsAsDistributed: decision.countsAsDistributed,
    overrideReason: input.overrideReason?.trim() || null,
    supervisorPin: synced ? null : input.supervisorPin ?? null,
    operatorId: session.user.id,
    operatorUsername: session.user.username,
    deviceId: device,
    offlineFlag,
    synced,
    syncError: null,
    conflictNote: decision.conflictNote,
    messageKey: decision.messageKey,
    latitude: location.latitude,
    longitude: location.longitude,
    locationAccuracyM: location.locationAccuracyM,
  }
}

async function saveLocal(row: LocalScan): Promise<LocalScan> {
  await db.scans.put(row)
  if (row.countsAsDistributed) await rememberServed(row)
  else await forgetServed(row.id)
  return row
}

export async function submitScan(input: ScanRequest): Promise<LocalScan> {
  const session = await getSession()
  if (!session) throw new ApiError(401, 'unauthorized')
  const id = crypto.randomUUID()
  const scannedAt = new Date().toISOString()
  const device = await deviceId()
  const locationPromise = captureLocation()
  const authorized = await pinMatches(input.supervisorPin)
  if ((input.mode === 'manual' || input.overrideReason) && !authorized && !navigator.onLine) {
    throw new ApiError(400, 'bad_pin')
  }
  let { decision, cardCode, scanDate } = await localDecision(input, id, scannedAt, authorized)
  let clientResult = decision.result
  if (input.mode === 'manual' && decision.blockReason !== 'voided' && decision.blockReason !== 'unknown' && decision.blockReason !== 'inactive' && decision.blockReason !== 'already_served') {
    clientResult = authorized || navigator.onLine ? 'ManualException' : decision.result
  }
  if (input.overrideReason && decision.blockReason === 'wrong_dp' && (authorized || navigator.onLine)) {
    clientResult = 'Override'
  }
  if (!decision.countsAsDistributed && clientResult !== 'Override' && clientResult !== 'ManualException') {
    clientResult = 'Blocked'
  }

  const location = await locationPromise
  const locationFields = {
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    locationAccuracyM: location?.accuracy ?? null,
  }
  const dpMeta = await db.dps.get(input.dpCode)
  if (dpMeta?.gpsCheckActive && (clientResult === 'Served' || clientResult === 'Override' || clientResult === 'ManualException' || decision.countsAsDistributed)) {
    const fix =
      locationFields.latitude != null && locationFields.longitude != null
        ? { latitude: locationFields.latitude, longitude: locationFields.longitude }
        : null
    const verdict = checkGeofence(
      {
        latitude: dpMeta.latitude ?? null,
        longitude: dpMeta.longitude ?? null,
        gpsRadiusM: dpMeta.gpsRadiusM ?? 150,
        gpsCheckActive: true,
      },
      fix,
    )
    if (!verdict.ok) {
      decision = {
        result: 'Blocked',
        blockReason: verdict.reason,
        countsAsDistributed: false,
        hhCode: decision.hhCode,
        messageKey: verdict.reason,
        demoteExistingId: null,
        conflictNote:
          verdict.distanceM != null
            ? `Distance ${Math.round(verdict.distanceM)} m exceeds ${dpMeta.gpsRadiusM ?? 150} m`
            : null,
      }
      clientResult = 'Blocked'
    }
  }
  const payload = {
    id,
    cardCode,
    hhCode: input.hhCode ?? decision.hhCode,
    dpCode: input.dpCode,
    scannedAt,
    mode: input.mode,
    clientResult,
    clientBlockReason: clientResult === 'Blocked' ? decision.blockReason : null,
    overrideReason: input.overrideReason ?? null,
    supervisorPin: input.supervisorPin ?? null,
    offlineFlag: !navigator.onLine,
    deviceId: device,
    deviceLabel: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : device,
    operatorId: session.user.id,
    ...locationFields,
  }

  if (navigator.onLine) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const response = await api('/api/scans', { method: 'POST', body: JSON.stringify(payload), signal: controller.signal })
      const body = (await response.json()) as { error?: string; scan?: ServerScan; demotedScanId?: string | null }
      if (!response.ok) throw new ApiError(response.status, body.error ?? 'request_failed')
      if (!body.scan) throw new ApiError(500, 'request_failed')
      if (body.demotedScanId) {
        await db.scans.update(body.demotedScanId, {
          result: 'Blocked',
          blockReason: 'duplicate_conflict',
          countsAsDistributed: false,
          messageKey: 'duplicate_conflict',
          synced: 1,
        })
        await forgetServed(body.demotedScanId)
      }
      const saved = await saveLocal(
        toLocal(
          session,
          input,
          body.scan.id,
          body.scan.scannedAt,
          body.scan.scanDate,
          body.scan.cardCode,
          body.scan.clientResult,
          body.scan,
          1,
          body.scan.offlineFlag,
          device,
          {
            latitude: body.scan.latitude,
            longitude: body.scan.longitude,
            locationAccuracyM: body.scan.locationAccuracyM,
          },
        ),
      )
      notify()
      return saved
    } catch (error) {
      const offline = error instanceof DOMException || (error instanceof ApiError && error.code === 'offline')
      if (!offline) throw error
    } finally {
      clearTimeout(timer)
    }
  }

  if ((input.mode === 'manual' || input.overrideReason) && !authorized) throw new ApiError(400, 'bad_pin')
  if ((await db.households.count()) === 0) throw new ApiError(0, 'no_cache')
  const row = toLocal(session, input, id, scannedAt, scanDate, cardCode, clientResult, {
    ...decision,
    result: clientResult,
    countsAsDistributed: clientResult === 'Served' || clientResult === 'Override' || clientResult === 'ManualException',
    blockReason: clientResult === 'Blocked' ? decision.blockReason : null,
    messageKey: clientResult === 'Blocked' ? decision.messageKey : clientResult === 'Override' ? 'override' : clientResult === 'ManualException' ? 'manual_exception' : 'served',
  }, 0, true, device, locationFields)
  await saveLocal(row)
  await registerScanSync()
  notify()
  return row
}

export function readCard(raw: string): string | null {
  const parsed = parseCardPayload(raw)
  return parsed.cardCode ?? parsed.hhCode ?? null
}

export async function flushQueue(): Promise<number> {
  const session = await getSession()
  if (!session || !navigator.onLine) return 0
  const pending = (await db.scans.where('synced').equals(0).toArray()).filter((scan) => scan.operatorId === session.user.id)
  if (pending.length === 0) return 0
  try {
    const response = await api('/api/sync/scans', {
      method: 'POST',
      body: JSON.stringify({
        scans: pending.map((scan) => ({
          id: scan.id,
          cardCode: scan.cardCode,
          hhCode: scan.hhCode,
          dpCode: scan.dpCode,
          scannedAt: scan.scannedAt,
          mode: scan.mode,
          clientResult: scan.clientResult,
          clientBlockReason: scan.clientBlockReason,
          overrideReason: scan.overrideReason,
          supervisorPin: scan.supervisorPin,
          offlineFlag: true,
          deviceId: scan.deviceId,
          operatorId: scan.operatorId,
          latitude: scan.latitude,
          longitude: scan.longitude,
          locationAccuracyM: scan.locationAccuracyM,
        })),
      }),
    })
    if (!response.ok) return 0
    const body = (await response.json()) as {
      results: Array<{ ok: true; scan: ServerScan; demotedScanId: string | null } | { ok: false; id: string; error: string }>
    }
    for (const result of body.results) {
      if (!result.ok) {
        const permanent = ['bad_pin', 'invalid_body', 'operator_mismatch', 'forbidden', 'forbidden_dp', 'reason_required', 'clock_skew'].includes(result.error)
        if (permanent) {
          await db.scans.update(result.id, { synced: 1, syncError: result.error, countsAsDistributed: false, supervisorPin: null })
          await forgetServed(result.id)
        }
        continue
      }
      await db.scans.update(result.scan.id, {
        synced: 1,
        result: result.scan.result,
        blockReason: result.scan.blockReason,
        countsAsDistributed: result.scan.countsAsDistributed,
        conflictNote: result.scan.conflictNote,
        messageKey: result.scan.messageKey,
        supervisorPin: null,
        syncError: null,
      })
      if (result.scan.countsAsDistributed) await rememberServed({ ...result.scan, id: result.scan.id })
      else await forgetServed(result.scan.id)
      if (result.demotedScanId) {
        await db.scans.update(result.demotedScanId, {
          result: 'Blocked',
          blockReason: 'duplicate_conflict',
          countsAsDistributed: false,
          messageKey: 'duplicate_conflict',
          synced: 1,
        })
        await forgetServed(result.demotedScanId)
      }
    }
    const accepted = body.results.filter((result) => result.ok).length
    if (accepted > 0) notify()
    return accepted
  } catch {
    return 0
  }
}

export async function pullBundle(): Promise<void> {
  const response = await api('/api/sync/bundle')
  if (!response.ok) throw new ApiError(response.status, 'bundle_failed')
  const bundle = (await response.json()) as {
    generatedAt: string
    scanDate: string
    dps: Array<{
      code: string
      nameEn: string
      nameAr: string
      district: string
      latitude?: number | null
      longitude?: number | null
      gpsRadiusM?: number
      gpsCheckActive?: boolean
    }>
    households: BundleHousehold[]
    voidedCards: Array<{ cardCode: string; hhCode: string }>
    servedToday: Array<{ clientScanId: string; hhCode: string; result: string; scannedAt: string; dpCode: string }>
    revokedToday: Array<{ id: string; conflictNote: string | null }>
    supervisorPins: Array<{ userId: string; username: string; displayName: string; pinHash: string }>
  }
  const unsynced = (await db.scans.where('synced').equals(0).toArray()).filter((scan) => scan.countsAsDistributed)
  await db.transaction('rw', [db.households, db.voidedCards, db.dps, db.pins, db.served, db.scans, db.meta], async () => {
    await db.households.clear()
    await db.households.bulkPut(bundle.households)
    await db.voidedCards.clear()
    await db.voidedCards.bulkPut(bundle.voidedCards)
    await db.dps.bulkPut(
      bundle.dps.map((dp) => ({
        code: dp.code,
        nameEn: dp.nameEn,
        nameAr: dp.nameAr,
        district: dp.district,
        latitude: dp.latitude ?? null,
        longitude: dp.longitude ?? null,
        gpsRadiusM: dp.gpsRadiusM ?? 150,
        gpsCheckActive: Boolean(dp.gpsCheckActive),
      })),
    )
    await db.pins.clear()
    await db.pins.bulkPut(bundle.supervisorPins)
    await db.served.clear()
    for (const row of bundle.servedToday) {
      await db.served.put({
        key: `${row.hhCode}|${bundle.scanDate}`,
        hhCode: row.hhCode,
        scanDate: bundle.scanDate,
        scannedAt: row.scannedAt,
        clientScanId: row.clientScanId,
        result: row.result,
        dpCode: row.dpCode,
      })
    }
    for (const scan of unsynced) {
      if (scan.hhCode) await rememberServed(scan)
    }
    for (const revoked of bundle.revokedToday) {
      await db.scans.update(revoked.id, {
        result: 'Blocked',
        blockReason: 'duplicate_conflict',
        countsAsDistributed: false,
        messageKey: 'duplicate_conflict',
        conflictNote: revoked.conflictNote,
        synced: 1,
      })
      await forgetServed(revoked.id)
    }
    await db.meta.put({ key: 'bundleAt', value: bundle.generatedAt })
    await db.meta.put({ key: 'scanDate', value: bundle.scanDate })
  })
}

export async function syncAll(): Promise<void> {
  await flushQueue()
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      await pullBundle()
      await db.meta.put({ key: 'lastSyncAt', value: new Date().toISOString() })
    } catch {
      /* keep the last validated list */
    }
  }
  notify()
}

export async function registerScanSync(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const registration = await navigator.serviceWorker.ready
    const sync = (registration as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync
    await sync?.register('hdp-scans')
  } catch {
    /* Background Sync is not available on every tablet. */
  }
}

export async function bundleAge(): Promise<string | null> {
  const sync = await db.meta.get('lastSyncAt')
  if (sync?.value) return sync.value
  const row = await db.meta.get('bundleAt')
  return row?.value ?? null
}

export async function pendingCount(): Promise<number> {
  return db.scans.where('synced').equals(0).count()
}

export async function corrections(): Promise<LocalScan[]> {
  return db.scans
    .filter(
      (scan) =>
        scan.synced === 1 &&
        !scan.countsAsDistributed &&
        (scan.clientResult === 'Served' || scan.clientResult === 'Override' || scan.clientResult === 'ManualException'),
    )
    .toArray()
}
