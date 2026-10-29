import {
  adenDate,
  cardPayload,
  checkGeofence,
  countsAsDistributed,
  decideScan,
  formatHhCode,
  hashSecret,
  isHhCode,
  newCardCode,
  normalizeHhCode,
  reconciliationVariance,
  resolveArrival,
  verifySecret,
  type BlockReason,
  type Role,
  type ScanDecision,
  type ScanResult,
} from '@hdp/rules'
import { asBool, asText, type Database, type Queryable, type Row } from './db.js'

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code)
  }
}

export interface Actor {
  id: string
  username: string
  displayName: string
  role: Role
  dpCodes: string[]
}

export interface IncomingScan {
  id: string
  cardCode?: string | null
  hhCode?: string | null
  dpCode: string
  scannedAt: string
  mode: 'card' | 'manual'
  clientResult: ScanResult
  clientBlockReason?: string | null
  overrideReason?: string | null
  supervisorPin?: string | null
  offlineFlag?: boolean
  deviceId: string
  deviceLabel?: string | null
  operatorId: string
  latitude?: number | null
  longitude?: number | null
  locationAccuracyM?: number | null
}

export interface ScanDto {
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
  operatorId: string
  deviceId: string
  offlineFlag: boolean
  overrideReason: string | null
  supervisorId: string | null
  scannedAt: string
  syncedAt: string | null
  conflictNote: string | null
  messageKey: string
  latitude: number | null
  longitude: number | null
  locationAccuracyM: number | null
}

const BLOCKS = new Set<BlockReason>([
  'already_served',
  'voided',
  'wrong_dp',
  'unknown',
  'inactive',
  'no_card',
  'duplicate_conflict',
  'out_of_geofence',
  'location_required',
])

function inClause(values: string[], start: number): { sql: string; next: number } {
  return {
    sql: values.map((_, index) => `$${start + index}`).join(', '),
    next: start + values.length,
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String(error.code) : ''
  const message = error instanceof Error ? error.message : ''
  return code === '23505' || message.includes('one_distribution_per_hh_day') || message.includes('duplicate key')
}

function cleanLabel(label?: string | null, max = 80): string | null {
  if (!label) return null
  const text = label.replace(/[\r\n]+/g, ' ').trim()
  return text ? text.slice(0, max) : null
}

export function mapScan(row: Row): ScanDto {
  const result = String(row.result) as ScanResult
  return {
    id: String(row.id),
    hhCode: row.hh_code == null ? null : String(row.hh_code),
    cardCode: row.card_code == null ? null : String(row.card_code),
    dpCode: String(row.dp_code),
    scanDate: String(row.scan_date).slice(0, 10),
    mode: row.mode === 'manual' ? 'manual' : 'card',
    clientResult: String(row.client_result) as ScanResult,
    result,
    blockReason: row.block_reason == null ? null : (String(row.block_reason) as BlockReason),
    countsAsDistributed: asBool(row.counts_as_distributed),
    operatorId: String(row.operator_id),
    deviceId: String(row.device_id),
    offlineFlag: asBool(row.offline_flag),
    overrideReason: row.override_reason == null ? null : String(row.override_reason),
    supervisorId: row.supervisor_id == null ? null : String(row.supervisor_id),
    scannedAt: asText(row.scanned_at) ?? '',
    syncedAt: asText(row.synced_at),
    conflictNote: row.conflict_note == null ? null : String(row.conflict_note),
    messageKey: row.block_reason == null ? resultKey(result) : String(row.block_reason),
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    locationAccuracyM: row.location_accuracy_m == null ? null : Number(row.location_accuracy_m),
  }
}

function resultKey(result: ScanResult): string {
  if (result === 'Served') return 'served'
  if (result === 'Override') return 'override'
  if (result === 'ManualException') return 'manual_exception'
  return 'unknown'
}

function mapHousehold(row: Row) {
  return {
    hhCode: String(row.hh_code),
    dpCode: String(row.dp_code),
    status: row.status === 'inactive' ? 'inactive' : 'active',
    activeCardCode: row.active_card_code == null ? null : String(row.active_card_code),
    beneficiaryCount: row.beneficiary_count == null ? 0 : Number(row.beneficiary_count),
  } as const
}

export async function loadActor(db: Queryable, userId: string): Promise<Actor | null> {
  const users = await db.query(
    `SELECT id, username, display_name, role FROM users WHERE id = $1 AND active = TRUE`,
    [userId],
  )
  const user = users[0]
  if (!user) return null
  const role = String(user.role) as Role
  const dps = await db.query(`SELECT dp_code FROM user_dps WHERE user_id = $1 ORDER BY dp_code`, [userId])
  return {
    id: String(user.id),
    username: String(user.username),
    displayName: String(user.display_name),
    role,
    dpCodes: dps.map((row) => String(row.dp_code)),
  }
}

export async function login(db: Database, username: string, password: string): Promise<Actor> {
  const rows = await db.query(`SELECT id, password_hash FROM users WHERE username = $1 AND active = TRUE`, [
    username.trim().toLowerCase(),
  ])
  const row = rows[0]
  if (!row || !verifySecret(password, String(row.password_hash))) {
    throw new HttpError(401, 'invalid_login')
  }
  const actor = await loadActor(db, String(row.id))
  if (!actor) throw new HttpError(401, 'invalid_login')
  return actor
}


async function loadDpGeofence(tx: Queryable, dpCode: string) {
  const rows = await tx.query(
    `SELECT latitude, longitude, gps_radius_m, gps_check_active FROM distribution_points WHERE code = $1`,
    [dpCode],
  )
  if (!rows[0]) throw new HttpError(400, 'unknown_dp')
  return {
    latitude: rows[0].latitude == null ? null : Number(rows[0].latitude),
    longitude: rows[0].longitude == null ? null : Number(rows[0].longitude),
    gpsRadiusM: Number(rows[0].gps_radius_m) || 150,
    gpsCheckActive: asBool(rows[0].gps_check_active),
  }
}

function applyGeofence(
  decision: ScanDecision,
  point: { latitude: number | null; longitude: number | null; gpsRadiusM: number; gpsCheckActive: boolean },
  scan: IncomingScan,
): ScanDecision {
  if (!decision.countsAsDistributed) return decision
  const fix =
    scan.latitude != null && scan.longitude != null
      ? { latitude: scan.latitude, longitude: scan.longitude }
      : null
  const verdict = checkGeofence(point, fix)
  if (verdict.ok) return decision
  return {
    result: 'Blocked',
    blockReason: verdict.reason,
    countsAsDistributed: false,
    hhCode: decision.hhCode,
    messageKey: verdict.reason,
    demoteExistingId: null,
    conflictNote:
      verdict.distanceM != null
        ? `Distance ${Math.round(verdict.distanceM)} m exceeds ${point.gpsRadiusM} m`
        : null,
  }
}

async function assertActiveDp(tx: Queryable, dpCode: string): Promise<void> {
  const rows = await tx.query(`SELECT code FROM distribution_points WHERE code = $1 AND active = TRUE`, [dpCode])
  if (!rows[0]) throw new HttpError(400, 'unknown_dp')
}

function assertDpAccess(actor: Actor, dpCode: string): void {
  if (actor.role === 'admin') return
  if (!actor.dpCodes.includes(dpCode)) throw new HttpError(403, 'forbidden')
}

/** Admin always sees every active DP; other roles use assigned codes. */
async function accessibleDpCodes(db: Database, actor: Actor): Promise<string[]> {
  if (actor.role === 'admin') {
    const rows = await db.query(`SELECT code FROM distribution_points WHERE active = TRUE ORDER BY code`)
    return rows.map((row) => String(row.code))
  }
  return actor.dpCodes
}

async function matchSupervisor(tx: Queryable, pin: string): Promise<string | null> {
  const rows = await tx.query<{ id: string; pin_hash: string | null }>(
    `SELECT id, pin_hash FROM users WHERE role = 'supervisor' AND active = TRUE AND pin_hash IS NOT NULL`,
  )
  for (const row of rows) {
    if (row.pin_hash && verifySecret(pin, row.pin_hash)) return row.id
  }
  return null
}

async function lookupHousehold(tx: Queryable, scan: IncomingScan) {
  if (scan.mode === 'card') {
    const cardCode = scan.cardCode?.trim().toUpperCase()
    if (!cardCode) throw new HttpError(400, 'card_required')
    const active = await tx.query(
      `SELECT hh_code, dp_code, status, active_card_code, beneficiary_count FROM households WHERE active_card_code = $1`,
      [cardCode],
    )
    if (active[0]) return { household: mapHousehold(active[0]), knownVoided: false, cardCode }
    const historical = await tx.query(
      `SELECT h.hh_code, h.dp_code, h.status, h.active_card_code, h.beneficiary_count
       FROM card_issuance ci
       JOIN households h ON h.hh_code = ci.hh_code
       WHERE ci.card_code = $1
       LIMIT 1`,
      [cardCode],
    )
    if (historical[0]) return { household: mapHousehold(historical[0]), knownVoided: true, cardCode }
    return { household: null, knownVoided: false, cardCode }
  }
  const hhCode = scan.hhCode ? normalizeHhCode(scan.hhCode) : ''
  if (!isHhCode(hhCode)) throw new HttpError(400, 'invalid_hh')
  const rows = await tx.query(
    `SELECT hh_code, dp_code, status, active_card_code, beneficiary_count FROM households WHERE hh_code = $1`,
    [hhCode],
  )
  return {
    household: rows[0] ? mapHousehold(rows[0]) : null,
    knownVoided: false,
    cardCode: null as string | null,
  }
}

function forceClientBlock(decision: ScanDecision, clientBlockReason?: string | null): ScanDecision {
  const clientReason = clientBlockReason && BLOCKS.has(clientBlockReason as BlockReason)
    ? (clientBlockReason as BlockReason)
    : null
  return {
    result: 'Blocked',
    blockReason: decision.countsAsDistributed ? (clientReason ?? 'already_served') : (decision.blockReason ?? clientReason),
    countsAsDistributed: false,
    hhCode: decision.hhCode,
    messageKey: decision.countsAsDistributed
      ? (clientReason ?? 'already_served')
      : (decision.blockReason ?? clientReason ?? 'unknown'),
    demoteExistingId: null,
    conflictNote: decision.countsAsDistributed ? 'Device did not serve' : decision.conflictNote,
  }
}

async function insertScan(
  tx: Queryable,
  scan: IncomingScan,
  actor: Actor,
  decision: ScanDecision,
  scanDate: string,
  cardCode: string | null,
  supervisorId: string | null,
): Promise<void> {
  await tx.query(
    `INSERT INTO meal_scans (
      id, hh_code, card_code, dp_code, scan_date, mode, client_result, result, block_reason,
      counts_as_distributed, operator_id, device_id, offline_flag, override_reason, supervisor_id,
      scanned_at, synced_at, conflict_note, latitude, longitude, location_accuracy_m
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14, $15,
      $16, now(), $17, $18, $19, $20
    )`,
    [
      scan.id,
      decision.hhCode,
      cardCode,
      scan.dpCode,
      scanDate,
      scan.mode,
      scan.clientResult,
      decision.result,
      decision.blockReason,
      decision.countsAsDistributed,
      actor.id,
      scan.deviceId,
      Boolean(scan.offlineFlag),
      scan.overrideReason?.trim() || null,
      supervisorId,
      scan.scannedAt,
      decision.conflictNote,
      scan.latitude ?? null,
      scan.longitude ?? null,
      scan.locationAccuracyM ?? null,
    ],
  )
}

export async function applyOne(
  db: Database,
  actor: Actor,
  scan: IncomingScan,
): Promise<{ scan: ScanDto; demotedScanId: string | null }> {
  if (scan.operatorId !== actor.id) throw new HttpError(400, 'operator_mismatch')
  if (actor.role !== 'dp_focal' && actor.role !== 'supervisor') throw new HttpError(403, 'forbidden')
  const scannedMs = Date.parse(scan.scannedAt)
  if (Number.isNaN(scannedMs)) throw new HttpError(400, 'invalid_time')
  if (scannedMs > Date.now() + 2 * 60 * 60 * 1000) throw new HttpError(400, 'clock_skew')
  if ((scan.latitude == null) !== (scan.longitude == null)) throw new HttpError(400, 'invalid_location')
  scan.dpCode = scan.dpCode.trim().toUpperCase()
  if (!actor.dpCodes.includes(scan.dpCode)) throw new HttpError(403, 'forbidden_dp')

  return db.transaction(async (tx) => {
    const existingRows = await tx.query(`SELECT * FROM meal_scans WHERE id = $1`, [scan.id])
    if (existingRows[0]) {
      if (String(existingRows[0].operator_id) !== actor.id) throw new HttpError(409, 'duplicate_id')
      return { scan: mapScan(existingRows[0]), demotedScanId: null }
    }

    await assertActiveDp(tx, scan.dpCode)
    const reason = scan.overrideReason?.trim() ?? ''
    if ((scan.mode === 'manual' || reason.length > 0) && reason.length < 3) {
      throw new HttpError(400, 'reason_required')
    }
    let supervisorId: string | null = null
    if (scan.mode === 'manual' || reason.length >= 3) {
      if (!scan.supervisorPin) throw new HttpError(400, 'bad_pin')
      supervisorId = await matchSupervisor(tx, scan.supervisorPin)
      if (!supervisorId) throw new HttpError(400, 'bad_pin')
    }

    const found = await lookupHousehold(tx, scan)
    if (found.household) {
      await tx.query(`SELECT hh_code FROM households WHERE hh_code = $1 FOR UPDATE`, [found.household.hhCode])
    }
    const scanDate = adenDate(scan.scannedAt)
    let existingSuccess: { clientScanId: string; scannedAt: string; result: 'Served' } | null = null
    if (found.household) {
      const prior = await tx.query(
        `SELECT id, result, scanned_at FROM meal_scans
         WHERE hh_code = $1 AND scan_date = $2 AND counts_as_distributed = TRUE`,
        [found.household.hhCode, scanDate],
      )
      if (prior[0]) {
        existingSuccess = {
          clientScanId: String(prior[0].id),
          scannedAt: asText(prior[0].scanned_at) ?? '',
          result: 'Served',
        }
      }
    }

    let decision = decideScan({
      clientScanId: scan.id,
      mode: scan.mode,
      cardCode: found.cardCode,
      dpCode: scan.dpCode,
      household: found.household,
      knownVoided: found.knownVoided,
      existingSuccess: null,
      supervisorAuthorized: Boolean(supervisorId) && (scan.mode === 'manual' || reason.length >= 3),
    })
    if (decision.countsAsDistributed) {
      decision = resolveArrival(decision, existingSuccess, { clientScanId: scan.id, scannedAt: scan.scannedAt })
    }
    const fence = await loadDpGeofence(tx, scan.dpCode)
    decision = applyGeofence(decision, fence, scan)
    if (!countsAsDistributed(scan.clientResult)) {
      decision = forceClientBlock(decision, scan.clientBlockReason)
    }

    if (decision.demoteExistingId) {
      await tx.query(
        `UPDATE meal_scans
         SET result = 'Blocked', block_reason = 'duplicate_conflict', counts_as_distributed = FALSE,
             conflict_note = $2
         WHERE id = $1`,
        [decision.demoteExistingId, `Superseded by earlier scan ${scan.id}`],
      )
    }

    try {
      await insertScan(tx, scan, actor, decision, scanDate, found.cardCode, supervisorId)
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      throw new HttpError(409, 'already_served')
    }

    await tx.query(
      `INSERT INTO devices (device_id, label, last_user_id, last_seen_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (device_id) DO UPDATE SET last_user_id = $3, last_seen_at = now(), label = EXCLUDED.label`,
      [scan.deviceId, scan.deviceLabel?.trim().slice(0, 120) || scan.deviceId, actor.id],
    )

    const stored = await tx.query(`SELECT * FROM meal_scans WHERE id = $1`, [scan.id])
    return { scan: mapScan(stored[0]), demotedScanId: decision.demoteExistingId }
  })
}

export async function applyScans(db: Database, actor: Actor, scans: IncomingScan[]) {
  const ordered = [...scans].sort((a, b) => a.scannedAt.localeCompare(b.scannedAt) || a.id.localeCompare(b.id))
  const results: Array<{ ok: true; scan: ScanDto; demotedScanId: string | null } | { ok: false; id: string; error: string }> = []
  for (const scan of ordered) {
    try {
      results.push({ ok: true, ...(await applyOne(db, actor, scan)) })
    } catch (error) {
      if (error instanceof HttpError) {
        results.push({ ok: false, id: scan.id, error: error.code })
        continue
      }
      throw error
    }
  }
  if (scans.length > 0) {
    await db.query(
      `INSERT INTO sync_log (id, device_id, operator_id, accepted_count) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), scans[0].deviceId, actor.id, results.filter((item) => item.ok).length],
    )
  }
  return results
}

export async function syncBundle(db: Database, actor: Actor) {
  const scanDate = adenDate()
  // Admin: every active DP. Others: assigned user_dps (same as dashboard).
  const scopeCodes = await accessibleDpCodes(db, actor)
  if (scopeCodes.length === 0) {
    return { generatedAt: new Date().toISOString(), scanDate, dps: [], households: [], voidedCards: [], servedToday: [], revokedToday: [], supervisorPins: [] }
  }
  const dpsIn = inClause(scopeCodes, 1)
  const dps = await db.query(
    `SELECT code, name_en, name_ar, district, latitude, longitude, gps_radius_m, gps_check_active
     FROM distribution_points WHERE active = TRUE AND code IN (${dpsIn.sql}) ORDER BY code`,
    scopeCodes,
  )
  const households = await db.query(
    `SELECT hh_code, dp_code, status, active_card_code, beneficiary_count FROM households WHERE dp_code IN (${dpsIn.sql}) ORDER BY hh_code`,
    scopeCodes,
  )
  const voidedCards = await db.query(
    `SELECT DISTINCT ci.card_code, ci.hh_code
     FROM card_issuance ci
     JOIN households h ON h.hh_code = ci.hh_code
     WHERE h.dp_code IN (${dpsIn.sql})
       AND (h.active_card_code IS NULL OR ci.card_code <> h.active_card_code)`,
    scopeCodes,
  )
  const servedParams = [scanDate, ...scopeCodes]
  const servedIn = inClause(scopeCodes, 2)
  const servedToday = await db.query(
    `SELECT id, hh_code, result, scanned_at, dp_code
     FROM meal_scans
     WHERE scan_date = $1 AND counts_as_distributed = TRUE
       AND hh_code IN (SELECT hh_code FROM households WHERE dp_code IN (${servedIn.sql}))`,
    servedParams,
  )
  const revokedToday = await db.query(
    `SELECT id, hh_code, conflict_note
     FROM meal_scans
     WHERE scan_date = $1 AND block_reason = 'duplicate_conflict'
       AND hh_code IN (SELECT hh_code FROM households WHERE dp_code IN (${servedIn.sql}))`,
    servedParams,
  )
  const supervisorPins =
    actor.role === 'dp_focal'
      ? await db.query(
          `SELECT id, username, display_name, pin_hash FROM users WHERE role = 'supervisor' AND active = TRUE AND pin_hash IS NOT NULL`,
        )
      : []

  return {
    generatedAt: new Date().toISOString(),
    scanDate,
    dps: dps.map((row) => ({
      code: String(row.code),
      nameEn: String(row.name_en),
      nameAr: String(row.name_ar),
      district: String(row.district),
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
      gpsRadiusM: Number(row.gps_radius_m) || 150,
      gpsCheckActive: asBool(row.gps_check_active),
    })),
    households: households.map((row) => mapHousehold(row)),
    voidedCards: voidedCards.map((row) => ({ cardCode: String(row.card_code), hhCode: String(row.hh_code) })),
    servedToday: servedToday.map((row) => ({
      clientScanId: String(row.id),
      hhCode: String(row.hh_code),
      result: String(row.result),
      scannedAt: asText(row.scanned_at),
      dpCode: String(row.dp_code),
    })),
    revokedToday: revokedToday.map((row) => ({
      id: String(row.id),
      hhCode: String(row.hh_code),
      conflictNote: row.conflict_note == null ? null : String(row.conflict_note),
    })),
    supervisorPins: supervisorPins.map((row) => ({
      userId: String(row.id),
      username: String(row.username),
      displayName: String(row.display_name),
      pinHash: String(row.pin_hash),
    })),
  }
}

export async function getScan(db: Database, actor: Actor, id: string): Promise<ScanDto> {
  const rows = await db.query(`SELECT * FROM meal_scans WHERE id = $1`, [id])
  if (!rows[0]) throw new HttpError(404, 'not_found')
  const scan = mapScan(rows[0])
  assertDpAccess(actor, scan.dpCode)
  return scan
}

export async function dashboard(db: Database, actor: Actor, scanDate: string, dpCode?: string) {
  const dps = dpCode ? [dpCode.toUpperCase()] : await accessibleDpCodes(db, actor)
  for (const code of dps) assertDpAccess(actor, code)
  if (dps.length === 0) return { scanDate, uniqueServed: 0, blocked: 0, byReason: {}, byResult: {} }
  const clause = inClause(dps, 2)
  const rows = await db.query(
    `SELECT result, block_reason, counts_as_distributed FROM meal_scans WHERE scan_date = $1 AND dp_code IN (${clause.sql})`,
    [scanDate, ...dps],
  )
  const byReason: Record<string, number> = {}
  const byResult: Record<string, number> = {}
  let uniqueServed = 0
  let blocked = 0
  for (const row of rows) {
    const result = String(row.result)
    byResult[result] = (byResult[result] ?? 0) + 1
    if (asBool(row.counts_as_distributed)) uniqueServed += 1
    else {
      blocked += 1
      const reason = row.block_reason == null ? 'other' : String(row.block_reason)
      byReason[reason] = (byReason[reason] ?? 0) + 1
    }
  }
  return { scanDate, dpCodes: dps, uniqueServed, blocked, byReason, byResult }
}

function requireWriter(actor: Actor): void {
  if (actor.role !== 'meal' && actor.role !== 'admin') throw new HttpError(403, 'forbidden')
}


export interface CardTemplate {
  titleEn: string
  titleAr: string
  projectTitleAr: string
  primaryColor: string
  showWfpLogo: boolean
  showHdpLogo: boolean
  wfpLogoDataUrl: string | null
  hdpLogoDataUrl: string | null
  rulesText: string
  freeLineEn: string
  freeLineAr: string
  complaintsHeadingAr: string
  hotlineHeadingAr: string
  hdpPanelTitleAr: string
  hdpPhone: string
  hdpWhatsapp: string
  partnerPanelTitleAr: string
  partnerPhone: string
  partnerWhatsapp: string
  reassuranceTextAr: string
  personalNoticeAr: string
  /** @deprecated kept for older clients; mirrored into hdpPhone when empty */
  wfpHotline: string
  hdpHotline: string
  validFrom: string
  validTo: string
  printBatch: string
  showSerial: boolean
  showBatch: boolean
  serialPrefix: string
}

const CARD_TEMPLATE_KEY = 'card_template'
const MAX_LOGO_CHARS = 350_000

export function defaultCardTemplate(): CardTemplate {
  const hdpHotline = process.env.HDP_HOTLINE?.trim() || ''
  return {
    titleEn: 'Beneficiary household card',
    titleAr: 'بطاقة أسرة مستفيدة',
    projectTitleAr: 'المطبخ المجتمعي',
    primaryColor: '#0B5C6B',
    showWfpLogo: true,
    showHdpLogo: true,
    wfpLogoDataUrl: null,
    hdpLogoDataUrl: null,
    rulesText: 'وجبة واحدة لكل أسرة في اليوم.\nالبطاقة شخصية وغير قابلة للبيع.\nبلّغ عن الفقدان في مكتب المساعدة.',
    freeLineEn: 'Assistance is FREE – do not pay anyone.',
    freeLineAr: 'المساعدة مجانية — لا تدفع لأي شخص',
    complaintsHeadingAr: 'الشكاوى والمقترحات',
    hotlineHeadingAr: 'الخط الساخن',
    hdpPanelTitleAr: 'برنامج التنمية الإنسانية',
    hdpPhone: hdpHotline,
    hdpWhatsapp: '',
    partnerPanelTitleAr: '',
    partnerPhone: '',
    partnerWhatsapp: '',
    reassuranceTextAr: 'المساعدة مجانية بالكامل — لا تدفع لأي شخص. وجبة واحدة لكل أسرة في اليوم.',
    personalNoticeAr: 'هذه البطاقة شخصية وغير قابلة للبيع. بلّغ عن الفقدان في مكتب المساعدة.',
    wfpHotline: process.env.WFP_HOTLINE?.trim() || '',
    hdpHotline,
    validFrom: process.env.CARD_VALID_FROM?.trim() || '',
    validTo: process.env.CARD_VALID_TO?.trim() || '',
    printBatch: '',
    showSerial: false,
    showBatch: false,
    serialPrefix: '',
  }
}


function normalizePrimaryColor(value: string | null | undefined): string {
  const raw = (value ?? '').trim()
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) return raw.toUpperCase()
  if (/^[0-9A-Fa-f]{6}$/.test(raw)) return `#${raw.toUpperCase()}`
  return '#0B5C6B'
}

function asDataUrl(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  if (!text) return null
  if (!/^data:image\/(png|jpe?g|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i.test(text)) {
    throw new HttpError(400, 'invalid_logo')
  }
  if (text.length > MAX_LOGO_CHARS) throw new HttpError(400, 'logo_too_large')
  return text
}

export function normalizeCardTemplate(input: Partial<CardTemplate> | null | undefined): CardTemplate {
  const base = defaultCardTemplate()
  if (!input) return base
  const rules = input.rulesText != null ? String(input.rulesText) : base.rulesText
  const hdpHotline = (input.hdpHotline != null ? String(input.hdpHotline) : base.hdpHotline).trim().slice(0, 80)
  const hdpPhoneRaw = (input.hdpPhone != null ? String(input.hdpPhone) : base.hdpPhone).trim().slice(0, 80)
  return {
    titleEn: (input.titleEn != null ? String(input.titleEn) : base.titleEn).trim().slice(0, 120) || base.titleEn,
    titleAr: (input.titleAr != null ? String(input.titleAr) : base.titleAr).trim().slice(0, 120) || base.titleAr,
    projectTitleAr: (input.projectTitleAr != null ? String(input.projectTitleAr) : base.projectTitleAr).trim().slice(0, 120) || base.projectTitleAr,
    primaryColor: normalizePrimaryColor(input.primaryColor != null ? String(input.primaryColor) : base.primaryColor),
    showWfpLogo: input.showWfpLogo !== false,
    showHdpLogo: input.showHdpLogo !== false,
    wfpLogoDataUrl: input.wfpLogoDataUrl === null ? null : input.wfpLogoDataUrl !== undefined ? asDataUrl(input.wfpLogoDataUrl) : base.wfpLogoDataUrl,
    hdpLogoDataUrl: input.hdpLogoDataUrl === null ? null : input.hdpLogoDataUrl !== undefined ? asDataUrl(input.hdpLogoDataUrl) : base.hdpLogoDataUrl,
    rulesText: rules.replace(/\r\n/g, '\n').trim().slice(0, 2000) || base.rulesText,
    freeLineEn: (input.freeLineEn != null ? String(input.freeLineEn) : base.freeLineEn).trim().slice(0, 200) || base.freeLineEn,
    freeLineAr: (input.freeLineAr != null ? String(input.freeLineAr) : base.freeLineAr).trim().slice(0, 200) || base.freeLineAr,
    complaintsHeadingAr: (input.complaintsHeadingAr != null ? String(input.complaintsHeadingAr) : base.complaintsHeadingAr).trim().slice(0, 120) || base.complaintsHeadingAr,
    hotlineHeadingAr: (input.hotlineHeadingAr != null ? String(input.hotlineHeadingAr) : base.hotlineHeadingAr).trim().slice(0, 80) || base.hotlineHeadingAr,
    hdpPanelTitleAr: (input.hdpPanelTitleAr != null ? String(input.hdpPanelTitleAr) : base.hdpPanelTitleAr).trim().slice(0, 120) || base.hdpPanelTitleAr,
    hdpPhone: hdpPhoneRaw || hdpHotline,
    hdpWhatsapp: (input.hdpWhatsapp != null ? String(input.hdpWhatsapp) : base.hdpWhatsapp).trim().slice(0, 80),
    partnerPanelTitleAr: (input.partnerPanelTitleAr != null ? String(input.partnerPanelTitleAr) : base.partnerPanelTitleAr).trim().slice(0, 120),
    partnerPhone: (input.partnerPhone != null ? String(input.partnerPhone) : base.partnerPhone).trim().slice(0, 80),
    partnerWhatsapp: (input.partnerWhatsapp != null ? String(input.partnerWhatsapp) : base.partnerWhatsapp).trim().slice(0, 80),
    reassuranceTextAr: (input.reassuranceTextAr != null ? String(input.reassuranceTextAr) : base.reassuranceTextAr).trim().slice(0, 400) || base.reassuranceTextAr,
    personalNoticeAr: (input.personalNoticeAr != null ? String(input.personalNoticeAr) : base.personalNoticeAr).trim().slice(0, 300) || base.personalNoticeAr,
    wfpHotline: (input.wfpHotline != null ? String(input.wfpHotline) : base.wfpHotline).trim().slice(0, 80),
    hdpHotline,
    validFrom: (input.validFrom != null ? String(input.validFrom) : base.validFrom).trim().slice(0, 40),
    validTo: (input.validTo != null ? String(input.validTo) : base.validTo).trim().slice(0, 40),
    printBatch: (input.printBatch != null ? String(input.printBatch) : base.printBatch).trim().slice(0, 60),
    showSerial: input.showSerial === true,
    showBatch: input.showBatch === true,
    serialPrefix: (input.serialPrefix != null ? String(input.serialPrefix) : base.serialPrefix).trim().slice(0, 40),
  }
}

export async function getCardTemplate(db: Queryable): Promise<CardTemplate> {
  try {
    const rows = await db.query(`SELECT value_json FROM app_settings WHERE key = $1`, [CARD_TEMPLATE_KEY])
    if (!rows[0]?.value_json) return defaultCardTemplate()
    const parsed = JSON.parse(String(rows[0].value_json)) as Partial<CardTemplate>
    return normalizeCardTemplate(parsed)
  } catch {
    return defaultCardTemplate()
  }
}

export async function saveCardTemplate(db: Database, actor: Actor, input: Partial<CardTemplate>): Promise<CardTemplate> {
  if (actor.role !== 'admin') throw new HttpError(403, 'forbidden')
  const merged: Partial<CardTemplate> = { ...(await getCardTemplate(db)), ...input }
  if (input.showBatch === undefined && input.printBatch != null && String(input.printBatch).trim()) {
    merged.showBatch = true
  }
  const next = normalizeCardTemplate(merged)
  await db.query(
    `INSERT INTO app_settings (key, value_json, updated_at, updated_by)
     VALUES ($1, $2, now(), $3)
     ON CONFLICT (key) DO UPDATE
     SET value_json = EXCLUDED.value_json, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [CARD_TEMPLATE_KEY, JSON.stringify(next), actor.id],
  )
  await recordAudit(db, {
    actorId: actor.id,
    action: 'card_template.save',
    entityType: 'card_template',
    entityId: 'card_template',
    summary: 'Card template updated',
    detail: {
      titleAr: next.titleAr,
      projectTitleAr: next.projectTitleAr,
      primaryColor: next.primaryColor,
      validFrom: next.validFrom,
      validTo: next.validTo,
    },
  })
  return next
}

function printBatchId(cardCode: string, issuedAt: string | null | undefined, templateBatch?: string): string {
  const custom = templateBatch?.trim()
  if (custom) return custom
  const day = (issuedAt ?? '').slice(0, 10).replace(/-/g, '') || '00000000'
  const tail = cardCode.replace(/[^A-Z0-9]/gi, '').slice(-4).toUpperCase() || 'XXXX'
  return `PB-${day}-${tail}`
}

function cardPrintFields(template: CardTemplate, cardCode: string | null, issuedAt: string | null | undefined, createdDay: string) {
  const serial = cardCode ? `${template.serialPrefix}${cardCode}` : null
  return {
    titleEn: template.titleEn,
    titleAr: template.titleAr,
    projectTitleAr: template.projectTitleAr,
    primaryColor: template.primaryColor,
    showWfpLogo: template.showWfpLogo,
    showHdpLogo: template.showHdpLogo,
    wfpLogoDataUrl: template.wfpLogoDataUrl,
    hdpLogoDataUrl: template.hdpLogoDataUrl,
    rulesText: template.rulesText,
    freeLineEn: template.freeLineEn,
    freeLineAr: template.freeLineAr,
    complaintsHeadingAr: template.complaintsHeadingAr,
    hotlineHeadingAr: template.hotlineHeadingAr,
    hdpPanelTitleAr: template.hdpPanelTitleAr,
    hdpPhone: template.hdpPhone || template.hdpHotline || null,
    hdpWhatsapp: template.hdpWhatsapp || null,
    partnerPanelTitleAr: template.partnerPanelTitleAr || null,
    partnerPhone: template.partnerPhone || null,
    partnerWhatsapp: template.partnerWhatsapp || null,
    reassuranceTextAr: template.reassuranceTextAr,
    personalNoticeAr: template.personalNoticeAr,
    wfpHotline: template.wfpHotline || null,
    hdpHotline: template.hdpHotline || template.hdpPhone || null,
    validFrom: template.validFrom || createdDay,
    validTo: template.validTo || null,
    cardSerial: template.showSerial ? serial : null,
    printBatch: !cardCode
      ? null
      : template.printBatch.trim()
        ? template.printBatch.trim()
        : template.showBatch
          ? printBatchId(cardCode, issuedAt, template.printBatch)
          : null,
    showSerial: template.showSerial,
    showBatch: template.showBatch || Boolean(template.printBatch.trim()),
  }
}

async function dpNames(db: Queryable, dpCode: string): Promise<{ nameEn: string; nameAr: string }> {
  const rows = await db.query(`SELECT name_en, name_ar FROM distribution_points WHERE code = $1`, [dpCode])
  return {
    nameEn: rows[0] ? String(rows[0].name_en) : dpCode,
    nameAr: rows[0] ? String(rows[0].name_ar) : dpCode,
  }
}

export async function createHousehold(
  db: Database,
  actor: Actor,
  input: { dpCode: string; beneficiaryCount: number; label?: string | null },
) {
  requireWriter(actor)
  const dpCode = input.dpCode.toUpperCase()
  assertDpAccess(actor, dpCode)
  if (!Number.isInteger(input.beneficiaryCount) || input.beneficiaryCount < 1 || input.beneficiaryCount > 30) {
    throw new HttpError(400, 'invalid_count')
  }
  return db.transaction(async (tx) => {
    await assertActiveDp(tx, dpCode)
    const counters = await tx.query<{ last_number: number }>(
      `UPDATE hh_counters SET last_number = last_number + 1 WHERE dp_code = $1 RETURNING last_number`,
      [dpCode],
    )
    if (!counters[0]) throw new HttpError(400, 'unknown_dp')
    const hhCode = formatHhCode(dpCode, Number(counters[0].last_number))
    let cardCode = newCardCode()
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const clash = await tx.query(`SELECT hh_code FROM households WHERE active_card_code = $1`, [cardCode])
      if (!clash[0]) break
      cardCode = newCardCode()
    }
    const label = cleanLabel(input.label)
    await tx.query(
      `INSERT INTO households (hh_code, dp_code, beneficiary_count, label, active_card_code, registered_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [hhCode, dpCode, input.beneficiaryCount, label, cardCode, actor.id],
    )
    await tx.query(
      `INSERT INTO card_issuance (id, hh_code, card_code, action, reason, operator_id)
       VALUES ($1, $2, $3, 'issue', 'Initial issue', $4)`,
      [crypto.randomUUID(), hhCode, cardCode, actor.id],
    )
    const names = await dpNames(tx, dpCode)
    const template = await getCardTemplate(tx)
    const issuedAt = new Date().toISOString()
    await recordAudit(tx, {
      actorId: actor.id,
      action: 'household.create',
      entityType: 'household',
      entityId: hhCode,
      summary: `Registered household ${hhCode} at ${dpCode}`,
      detail: { dpCode, beneficiaryCount: input.beneficiaryCount, label, cardCode },
    })
    return {
      hhCode,
      dpCode,
      cardCode,
      payload: cardPayload(cardCode, hhCode),
      beneficiaryCount: input.beneficiaryCount,
      label,
      dpNameEn: names.nameEn,
      dpNameAr: names.nameAr,
      holderName: label,
      ...cardPrintFields(template, cardCode, issuedAt, adenDate()),
    }
  })
}

/** Reassign a household to another DP and/or edit its display name after registration.
 *  hh_code stays fixed so cards and scan history keep working. */
export async function updateHousehold(
  db: Database,
  actor: Actor,
  hhCode: string,
  input: { dpCode?: string; label?: string | null; beneficiaryCount?: number },
) {
  requireWriter(actor)
  const code = normalizeHhCode(hhCode)
  const hasDp = input.dpCode !== undefined
  const hasLabel = input.label !== undefined
  const hasCount = input.beneficiaryCount !== undefined
  if (!hasDp && !hasLabel && !hasCount) throw new HttpError(400, 'invalid_body')
  if (hasCount) {
    if (!Number.isInteger(input.beneficiaryCount) || (input.beneficiaryCount as number) < 1 || (input.beneficiaryCount as number) > 30) {
      throw new HttpError(400, 'invalid_count')
    }
  }
  return db.transaction(async (tx) => {
    const rows = await tx.query(
      `SELECT dp_code, label, beneficiary_count, status FROM households WHERE hh_code = $1 FOR UPDATE`,
      [code],
    )
    if (!rows[0]) throw new HttpError(404, 'unknown')
    const currentDp = String(rows[0].dp_code)
    assertDpAccess(actor, currentDp)
    let nextDp = currentDp
    if (hasDp) {
      nextDp = String(input.dpCode).toUpperCase()
      assertDpAccess(actor, nextDp)
      if (nextDp !== currentDp) await assertActiveDp(tx, nextDp)
    }
    const nextLabel = hasLabel ? cleanLabel(input.label) : rows[0].label == null ? null : String(rows[0].label)
    const nextCount = hasCount ? Number(input.beneficiaryCount) : Number(rows[0].beneficiary_count)
    await tx.query(
      `UPDATE households
       SET dp_code = $2, label = $3, beneficiary_count = $4, updated_at = now()
       WHERE hh_code = $1`,
      [code, nextDp, nextLabel, nextCount],
    )
    await recordAudit(tx, {
      actorId: actor.id,
      action: 'household.update',
      entityType: 'household',
      entityId: code,
      summary: `Updated household ${code}`,
      detail: {
        previousDpCode: currentDp,
        dpCode: nextDp,
        label: nextLabel,
        beneficiaryCount: nextCount,
      },
    })
    return {
      hhCode: code,
      dpCode: nextDp,
      label: nextLabel,
      beneficiaryCount: nextCount,
      status: String(rows[0].status),
      previousDpCode: currentDp,
    }
  })
}

export async function listHouseholds(db: Database, actor: Actor, query: { q?: string; dp?: string }) {
  if (actor.role === 'dp_focal') throw new HttpError(403, 'forbidden')
  const dps = query.dp ? [query.dp.toUpperCase()] : await accessibleDpCodes(db, actor)
  for (const code of dps) assertDpAccess(actor, code)
  if (dps.length === 0) return []
  const clause = inClause(dps, 1)
  const params: unknown[] = [...dps]
  let prefix = ''
  if (query.q?.trim()) {
    const raw = query.q.trim()
    const q = normalizeHhCode(raw).replace(/[%_]/g, '')
    params.push(`${q}%`)
    const hhParam = params.length
    params.push(`%${raw.replace(/[%_]/g, '')}%`)
    const labelParam = params.length
    prefix = ` AND (hh_code LIKE $${hhParam} OR COALESCE(label, '') ILIKE $${labelParam})`
  }
  const rows = await db.query(
    `SELECT hh_code, dp_code, beneficiary_count, label, status, active_card_code
     FROM households WHERE dp_code IN (${clause.sql})${prefix}
     ORDER BY hh_code LIMIT 50`,
    params,
  )
  return rows.map((row) => ({
    hhCode: String(row.hh_code),
    dpCode: String(row.dp_code),
    beneficiaryCount: Number(row.beneficiary_count),
    label: row.label == null ? null : String(row.label),
    status: String(row.status),
    activeCardCode: row.active_card_code == null ? null : String(row.active_card_code),
  }))
}


export async function listPrintableHouseholds(
  db: Database,
  actor: Actor,
  query: { q?: string; dp?: string; limit?: number } = {},
) {
  if (actor.role === 'dp_focal') throw new HttpError(403, 'forbidden')
  const dps = query.dp ? [query.dp.toUpperCase()] : await accessibleDpCodes(db, actor)
  for (const code of dps) assertDpAccess(actor, code)
  if (dps.length === 0) return []
  const clause = inClause(dps, 1)
  const params: unknown[] = [...dps]
  let prefix = ''
  if (query.q?.trim()) {
    const raw = query.q.trim()
    const q = normalizeHhCode(raw).replace(/[%_]/g, '')
    params.push(`${q}%`)
    const hhParam = params.length
    params.push(`%${raw.replace(/[%_]/g, '')}%`)
    const labelParam = params.length
    prefix = ` AND (h.hh_code LIKE $${hhParam} OR COALESCE(h.label, '') ILIKE $${labelParam})`
  }
  const limit = Math.min(Math.max(Number(query.limit) || 500, 1), 2000)
  params.push(limit)
  const rows = await db.query(
    `SELECT h.hh_code, h.dp_code, h.beneficiary_count, h.label, h.status, h.active_card_code, h.created_at,
            dp.name_en, dp.name_ar,
            (
              SELECT ci.created_at FROM card_issuance ci
              WHERE ci.hh_code = h.hh_code AND ci.action IN ('issue', 'reissue')
              ORDER BY ci.created_at DESC LIMIT 1
            ) AS issued_at
     FROM households h
     LEFT JOIN distribution_points dp ON dp.code = h.dp_code
     WHERE h.dp_code IN (${clause.sql})${prefix}
       AND h.active_card_code IS NOT NULL
     ORDER BY h.hh_code
     LIMIT $${params.length}`,
    params,
  )
  const template = await getCardTemplate(db)
  return rows.map((row) => {
    const activeCard = String(row.active_card_code)
    const issuedAt = asText(row.issued_at) ?? asText(row.created_at)
    const createdDay = (asText(row.created_at) ?? '').slice(0, 10) || adenDate()
    return {
      hhCode: String(row.hh_code),
      dpCode: String(row.dp_code),
      beneficiaryCount: Number(row.beneficiary_count),
      label: row.label == null ? null : String(row.label),
      status: String(row.status),
      activeCardCode: activeCard,
      dpNameEn: row.name_en == null ? String(row.dp_code) : String(row.name_en),
      dpNameAr: row.name_ar == null ? String(row.dp_code) : String(row.name_ar),
      holderName: row.label == null ? null : String(row.label),
      ...cardPrintFields(template, activeCard, issuedAt, createdDay),
    }
  })
}

export async function getHousehold(db: Database, actor: Actor, hhCode: string) {
  if (actor.role === 'dp_focal') throw new HttpError(403, 'forbidden')
  const code = normalizeHhCode(hhCode)
  const rows = await db.query(`SELECT * FROM households WHERE hh_code = $1`, [code])
  if (!rows[0]) throw new HttpError(404, 'unknown')
  assertDpAccess(actor, String(rows[0].dp_code))
  const history = await db.query(
    `SELECT card_code, action, reason, previous_card_code, created_at
     FROM card_issuance WHERE hh_code = $1 ORDER BY created_at DESC LIMIT 8`,
    [code],
  )
  const dpCode = String(rows[0].dp_code)
  const names = await dpNames(db, dpCode)
  const template = await getCardTemplate(db)
  const activeCard = rows[0].active_card_code == null ? null : String(rows[0].active_card_code)
  const latestIssue = history.find((row) => row.action === 'issue' || row.action === 'reissue') ?? history[0]
  const issuedAt = latestIssue ? asText(latestIssue.created_at) : asText(rows[0].created_at)
  const createdDay = (asText(rows[0].created_at) ?? '').slice(0, 10) || adenDate()
  return {
    hhCode: code,
    dpCode,
    beneficiaryCount: Number(rows[0].beneficiary_count),
    label: rows[0].label == null ? null : String(rows[0].label),
    status: String(rows[0].status),
    activeCardCode: activeCard,
    payload: activeCard ? cardPayload(activeCard, code) : null,
    dpNameEn: names.nameEn,
    dpNameAr: names.nameAr,
    holderName: rows[0].label == null ? null : String(rows[0].label),
    ...cardPrintFields(template, activeCard, issuedAt, createdDay),
    history: history.map((row) => ({
      cardCode: String(row.card_code),
      action: String(row.action),
      reason: row.reason == null ? null : String(row.reason),
      previousCardCode: row.previous_card_code == null ? null : String(row.previous_card_code),
      createdAt: asText(row.created_at),
    })),
  }
}

export async function voidCard(db: Database, actor: Actor, hhCode: string, reason: string) {
  requireWriter(actor)
  const trimmed = reason.trim()
  if (trimmed.length < 3) throw new HttpError(400, 'reason_required')
  const code = normalizeHhCode(hhCode)
  return db.transaction(async (tx) => {
    const rows = await tx.query(`SELECT dp_code, active_card_code, status FROM households WHERE hh_code = $1 FOR UPDATE`, [code])
    if (!rows[0]) throw new HttpError(404, 'unknown')
    assertDpAccess(actor, String(rows[0].dp_code))
    const active = rows[0].active_card_code == null ? null : String(rows[0].active_card_code)
    if (!active) throw new HttpError(400, 'no_card')
    await tx.query(`UPDATE households SET active_card_code = NULL, updated_at = now() WHERE hh_code = $1`, [code])
    await tx.query(
      `INSERT INTO card_issuance (id, hh_code, card_code, action, reason, operator_id)
       VALUES ($1, $2, $3, 'void', $4, $5)`,
      [crypto.randomUUID(), code, active, trimmed, actor.id],
    )
    await recordAudit(tx, {
      actorId: actor.id,
      action: 'card.void',
      entityType: 'card',
      entityId: code,
      summary: `Voided card for ${code}`,
      detail: { cardCode: active, reason: trimmed },
    })
    return { hhCode: code, voidedCardCode: active }
  })
}

export async function reissueCard(db: Database, actor: Actor, hhCode: string, reason: string) {
  requireWriter(actor)
  const trimmed = reason.trim()
  if (trimmed.length < 3) throw new HttpError(400, 'reason_required')
  const code = normalizeHhCode(hhCode)
  return db.transaction(async (tx) => {
    const rows = await tx.query(
      `SELECT dp_code, active_card_code, status FROM households WHERE hh_code = $1 FOR UPDATE`,
      [code],
    )
    if (!rows[0]) throw new HttpError(404, 'unknown')
    if (rows[0].status !== 'active') throw new HttpError(400, 'inactive')
    assertDpAccess(actor, String(rows[0].dp_code))
    const previous = rows[0].active_card_code == null ? null : String(rows[0].active_card_code)
    if (previous) {
      await tx.query(
        `INSERT INTO card_issuance (id, hh_code, card_code, action, reason, operator_id)
         VALUES ($1, $2, $3, 'void', $4, $5)`,
        [crypto.randomUUID(), code, previous, trimmed, actor.id],
      )
    }
    const cardCode = newCardCode()
    await tx.query(`UPDATE households SET active_card_code = $2, updated_at = now() WHERE hh_code = $1`, [code, cardCode])
    await tx.query(
      `INSERT INTO card_issuance (id, hh_code, card_code, action, reason, previous_card_code, operator_id)
       VALUES ($1, $2, $3, 'reissue', $4, $5, $6)`,
      [crypto.randomUUID(), code, cardCode, trimmed, previous, actor.id],
    )
    await recordAudit(tx, {
      actorId: actor.id,
      action: 'card.reissue',
      entityType: 'card',
      entityId: code,
      summary: `Reissued card for ${code}`,
      detail: { cardCode, previousCardCode: previous, reason: trimmed },
    })
    return { hhCode: code, cardCode, payload: cardPayload(cardCode, code), previousCardCode: previous }
  })
}

export async function upsertProduction(
  db: Database,
  actor: Actor,
  input: { dpCode: string; productionDate: string; mealsPrepared: number; notes?: string | null },
) {
  // Only MEAL may enter or adjust meals prepared. Admin/supervisor view via reconciliation.
  if (actor.role !== 'meal') throw new HttpError(403, 'forbidden')
  const dpCode = input.dpCode.toUpperCase()
  assertDpAccess(actor, dpCode)
  await assertActiveDp(db, dpCode)
  const notes = cleanLabel(input.notes)
  const previousRows = await db.query(
    `SELECT meals_prepared FROM daily_production WHERE dp_code = $1 AND production_date = $2`,
    [dpCode, input.productionDate],
  )
  const previous = previousRows[0] ? Number(previousRows[0].meals_prepared) : null
  await db.query(
    `INSERT INTO daily_production (dp_code, production_date, meals_prepared, recorded_by, notes)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (dp_code, production_date) DO UPDATE
     SET meals_prepared = EXCLUDED.meals_prepared, recorded_by = EXCLUDED.recorded_by,
         notes = EXCLUDED.notes, updated_at = now()`,
    [dpCode, input.productionDate, input.mealsPrepared, actor.id, notes],
  )
  await db.query(
    `INSERT INTO daily_production_history
      (id, dp_code, production_date, meals_prepared, previous_meals_prepared, recorded_by, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [crypto.randomUUID(), dpCode, input.productionDate, input.mealsPrepared, previous, actor.id, notes],
  )
  await recordAudit(db, {
    actorId: actor.id,
    action: previous == null ? 'production.create' : 'production.update',
    entityType: 'production',
    entityId: `${dpCode}:${input.productionDate}`,
    summary:
      previous == null
        ? `Meals prepared set to ${input.mealsPrepared} at ${dpCode} (${input.productionDate})`
        : `Meals prepared ${previous} → ${input.mealsPrepared} at ${dpCode} (${input.productionDate})`,
    detail: {
      dpCode,
      productionDate: input.productionDate,
      mealsPrepared: input.mealsPrepared,
      previousMealsPrepared: previous,
      notes,
    },
  })
  return {
    dpCode,
    productionDate: input.productionDate,
    mealsPrepared: input.mealsPrepared,
    previousMealsPrepared: previous,
  }
}

export async function reconciliation(db: Database, actor: Actor, scanDate: string) {
  if (actor.role === 'dp_focal') throw new HttpError(403, 'forbidden')
  const rows = []
  const codes = await accessibleDpCodes(db, actor)
  for (const dpCode of codes) {
    const production = await db.query(
      `SELECT meals_prepared FROM daily_production WHERE dp_code = $1 AND production_date = $2`,
      [dpCode, scanDate],
    )
    const served = await db.query(
      `SELECT COUNT(*) AS n FROM meal_scans WHERE dp_code = $1 AND scan_date = $2 AND counts_as_distributed = TRUE`,
      [dpCode, scanDate],
    )
    const names = await db.query(`SELECT name_en, name_ar FROM distribution_points WHERE code = $1`, [dpCode])
    const historyRows = await db.query(
      `SELECT h.meals_prepared, h.previous_meals_prepared, h.notes, h.created_at, u.display_name
       FROM daily_production_history h
       JOIN users u ON u.id = h.recorded_by
       WHERE h.dp_code = $1 AND h.production_date = $2
       ORDER BY h.created_at DESC
       LIMIT 20`,
      [dpCode, scanDate],
    )
    const prepared = production[0] ? Number(production[0].meals_prepared) : null
    const uniqueServed = Number(served[0]?.n ?? 0)
    const variance = reconciliationVariance(prepared, uniqueServed)
    rows.push({
      dpCode,
      nameEn: names[0] ? String(names[0].name_en) : dpCode,
      nameAr: names[0] ? String(names[0].name_ar) : dpCode,
      mealsPrepared: prepared,
      uniqueServed,
      canEditPrepared: actor.role === 'meal',
      history: historyRows.map((row) => ({
        at: String(row.created_at),
        mealsPrepared: Number(row.meals_prepared),
        previousMealsPrepared: row.previous_meals_prepared == null ? null : Number(row.previous_meals_prepared),
        recordedBy: String(row.display_name || ''),
        notes: row.notes == null ? null : String(row.notes),
      })),
      ...variance,
    })
  }
  return { scanDate, rows }
}

export async function createSpotCheck(
  db: Database,
  actor: Actor,
  input: { dpCode: string; hhCode?: string | null; finding: string; notes?: string | null },
) {
  if (actor.role !== 'supervisor' && actor.role !== 'admin') throw new HttpError(403, 'forbidden')
  const dpCode = input.dpCode.toUpperCase()
  assertDpAccess(actor, dpCode)
  const finding = input.finding.trim()
  if (finding.length < 3) throw new HttpError(400, 'finding_required')
  const id = crypto.randomUUID()
  const hhCode = input.hhCode?.trim() ? normalizeHhCode(input.hhCode) : null
  await db.query(
    `INSERT INTO spot_checks (id, dp_code, check_date, supervisor_id, hh_code, finding, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, dpCode, adenDate(), actor.id, hhCode, finding.slice(0, 80), cleanLabel(input.notes)],
  )
  await recordAudit(db, {
    actorId: actor.id,
    action: 'spot_check.create',
    entityType: 'spot_check',
    entityId: id,
    summary: `Spot check at ${dpCode}: ${finding.slice(0, 80)}`,
    detail: { dpCode, hhCode, finding: finding.slice(0, 80), notes: cleanLabel(input.notes) },
  })
  return { id, dpCode, finding }
}

function csvCell(value: unknown): string {
  if (value == null) return ''
  const text = String(value)
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export async function exportRegister(db: Database, actor: Actor, scanDate: string, dpCode?: string): Promise<string> {
  if (actor.role === 'dp_focal') throw new HttpError(403, 'forbidden')
  const dps = dpCode ? [dpCode.toUpperCase()] : await accessibleDpCodes(db, actor)
  for (const code of dps) assertDpAccess(actor, code)
  const columns = [
    'scan_date',
    'dp_code',
    'dp_name_en',
    'hh_code',
    'beneficiary_count',
    'result',
    'client_result',
    'counts_as_distributed',
    'block_reason',
    'operator_username',
    'device_id',
    'offline_flag',
    'scanned_at',
    'synced_at',
    'override_reason',
    'conflict_note',
    'mode',
    'latitude',
    'longitude',
    'location_accuracy_m',
  ]
  if (dps.length === 0) return `\uFEFF${columns.join(',')}\n`
  const clause = inClause(dps, 2)
  const rows = await db.query(
    `SELECT s.scan_date, s.dp_code, d.name_en, s.hh_code, h.beneficiary_count, s.result, s.client_result,
            s.counts_as_distributed, s.block_reason,
            CASE WHEN u.role = 'supervisor' THEN '' ELSE u.username END AS operator_username,
            s.device_id, s.offline_flag,
            s.scanned_at, s.synced_at, s.override_reason, s.conflict_note, s.mode,
            s.latitude, s.longitude, s.location_accuracy_m
     FROM meal_scans s
     JOIN users u ON u.id = s.operator_id
     JOIN distribution_points d ON d.code = s.dp_code
     LEFT JOIN households h ON h.hh_code = s.hh_code
     WHERE s.scan_date = $1 AND s.dp_code IN (${clause.sql})
     ORDER BY s.scanned_at, s.id`,
    [scanDate, ...dps],
  )
  const lines = [columns.join(',')]
  for (const row of rows) {
    lines.push(
      columns
        .map((column) => {
          if (column === 'dp_name_en') return csvCell(row.name_en)
          if (column === 'scanned_at' || column === 'synced_at') return csvCell(asText(row[column]))
          if (column === 'counts_as_distributed' || column === 'offline_flag') return csvCell(asBool(row[column]))
          return csvCell(row[column])
        })
        .join(','),
    )
  }
  return `\uFEFF${lines.join('\n')}\n`
}

export async function listDps(db: Database) {
  const rows = await db.query(
    `SELECT d.code, d.name_en, d.name_ar, d.district, d.active,
            d.latitude, d.longitude, d.gps_radius_m, d.gps_check_active,
            COALESCE((SELECT COUNT(*)::int FROM households h WHERE h.dp_code = d.code AND h.status = 'active'), 0) AS household_count
     FROM distribution_points d
     ORDER BY d.code`,
  )
  const links = await db.query(
    `SELECT ud.dp_code, u.id, u.username, u.display_name, u.role, u.active
     FROM user_dps ud
     JOIN users u ON u.id = ud.user_id
     ORDER BY u.username`,
  )
  return rows.map((row) => {
    const code = String(row.code)
    return {
      code,
      nameEn: String(row.name_en),
      nameAr: String(row.name_ar),
      district: String(row.district),
      active: asBool(row.active),
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
      gpsRadiusM: Number(row.gps_radius_m) || 150,
      gpsCheckActive: asBool(row.gps_check_active),
      householdCount: Number(row.household_count) || 0,
      assignedUsers: links
        .filter((link) => String(link.dp_code) === code)
        .map((link) => ({
          id: String(link.id),
          username: String(link.role) === 'supervisor' ? '' : String(link.username),
          displayName: String(link.role) === 'supervisor' ? '' : String(link.display_name),
          role: String(link.role),
          active: asBool(link.active),
        })),
    }
  })
}

const DP_CODE = /^[A-Z0-9]{2,8}$/
type District = 'Al-Mudhaffar' | 'Al-Qahira'

function normalizeDpCode(code: string): string {
  const normalized = code.trim().toUpperCase()
  if (!DP_CODE.test(normalized)) throw new HttpError(400, 'invalid_dp_code')
  return normalized
}

function normalizeGpsFields(input: {
  latitude?: number | null
  longitude?: number | null
  gpsRadiusM?: number | null
  gpsCheckActive?: boolean | null
}) {
  const latitude = input.latitude == null ? null : Number(input.latitude)
  const longitude = input.longitude == null ? null : Number(input.longitude)
  if ((latitude == null) !== (longitude == null)) throw new HttpError(400, 'invalid_location')
  if (latitude != null && (latitude < -90 || latitude > 90)) throw new HttpError(400, 'invalid_location')
  if (longitude != null && (longitude < -180 || longitude > 180)) throw new HttpError(400, 'invalid_location')
  const gpsRadiusM = input.gpsRadiusM == null ? 150 : Number(input.gpsRadiusM)
  if (!Number.isFinite(gpsRadiusM) || gpsRadiusM < 10 || gpsRadiusM > 5000) throw new HttpError(400, 'invalid_gps_radius')
  const gpsCheckActive = Boolean(input.gpsCheckActive)
  if (gpsCheckActive && (latitude == null || longitude == null)) throw new HttpError(400, 'gps_point_required')
  return { latitude, longitude, gpsRadiusM, gpsCheckActive }
}

export async function createDp(
  db: Database,
  input: {
    code: string
    nameEn: string
    nameAr: string
    district: District
    active?: boolean
    latitude?: number | null
    longitude?: number | null
    gpsRadiusM?: number | null
    gpsCheckActive?: boolean | null
  },
  actor?: Actor | null,
) {
  const code = normalizeDpCode(input.code)
  const nameEn = input.nameEn.trim()
  const nameAr = input.nameAr.trim()
  const active = input.active !== false
  const gps = normalizeGpsFields(input)
  try {
    await db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO distribution_points
           (code, name_en, name_ar, district, active, latitude, longitude, gps_radius_m, gps_check_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [code, nameEn, nameAr, input.district, active, gps.latitude, gps.longitude, gps.gpsRadiusM, gps.gpsCheckActive],
      )
      await tx.query(`INSERT INTO hh_counters (dp_code, last_number) VALUES ($1, 0)`, [code])
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, 'dp_code_taken')
    throw error
  }
  if (actor) {
    await recordAudit(db, {
      actorId: actor.id,
      action: 'dp.create',
      entityType: 'distribution_point',
      entityId: code,
      summary: `Created distribution point ${code}`,
      detail: { nameEn, nameAr, district: input.district, active, ...gps },
    })
  }
  return {
    code,
    nameEn,
    nameAr,
    district: input.district,
    active,
    latitude: gps.latitude,
    longitude: gps.longitude,
    gpsRadiusM: gps.gpsRadiusM,
    gpsCheckActive: gps.gpsCheckActive,
    householdCount: 0,
    assignedUsers: [] as Array<{ id: string; username: string; displayName: string; role: string; active: boolean }>,
  }
}

async function replaceDpAssignments(db: Database, dpCode: string, userIds: string[]) {
  const unique = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))]
  let supervisorCount = 0
  for (const id of unique) {
    const found = await db.query(`SELECT id, role FROM users WHERE id = $1`, [id])
    if (!found[0]) throw new HttpError(400, 'invalid_body')
    if (String(found[0].role) === 'supervisor') supervisorCount += 1
  }
  if (supervisorCount > 1) throw new HttpError(400, 'too_many_supervisors')
  await db.transaction(async (tx) => {
    await tx.query(`DELETE FROM user_dps WHERE dp_code = $1`, [dpCode])
    for (const id of unique) {
      await tx.query(`INSERT INTO user_dps (user_id, dp_code) VALUES ($1, $2)`, [id, dpCode])
    }
  })
}

export async function patchDp(
  db: Database,
  code: string,
  input: {
    code?: string
    active?: boolean
    nameEn?: string
    nameAr?: string
    district?: District
    userIds?: string[]
    latitude?: number | null
    longitude?: number | null
    gpsRadiusM?: number | null
    gpsCheckActive?: boolean | null
  },
  actor?: Actor | null,
) {
  const currentCode = code.trim().toUpperCase()
  const current = await db.query(
    `SELECT code, name_en, name_ar, district, active, latitude, longitude, gps_radius_m, gps_check_active
     FROM distribution_points WHERE code = $1`,
    [currentCode],
  )
  if (!current[0]) throw new HttpError(404, 'unknown_dp')
  if (input.code !== undefined && input.code.trim().toUpperCase() !== currentCode) {
    throw new HttpError(409, 'dp_code_immutable')
  }
  const nameEn = input.nameEn !== undefined ? input.nameEn.trim() : String(current[0].name_en)
  const nameAr = input.nameAr !== undefined ? input.nameAr.trim() : String(current[0].name_ar)
  const district = input.district ?? (String(current[0].district) as District)
  const active = typeof input.active === 'boolean' ? input.active : asBool(current[0].active)
  const gps = normalizeGpsFields({
    latitude: input.latitude !== undefined ? input.latitude : (current[0].latitude == null ? null : Number(current[0].latitude)),
    longitude: input.longitude !== undefined ? input.longitude : (current[0].longitude == null ? null : Number(current[0].longitude)),
    gpsRadiusM: input.gpsRadiusM !== undefined ? input.gpsRadiusM : Number(current[0].gps_radius_m) || 150,
    gpsCheckActive: input.gpsCheckActive !== undefined ? input.gpsCheckActive : asBool(current[0].gps_check_active),
  })
  await db.query(
    `UPDATE distribution_points
     SET name_en = $2, name_ar = $3, district = $4, active = $5,
         latitude = $6, longitude = $7, gps_radius_m = $8, gps_check_active = $9
     WHERE code = $1`,
    [currentCode, nameEn, nameAr, district, active, gps.latitude, gps.longitude, gps.gpsRadiusM, gps.gpsCheckActive],
  )
  if (input.userIds) await replaceDpAssignments(db, currentCode, input.userIds)
  const listed = await listDps(db)
  const row = listed.find((item) => item.code === currentCode)
  if (actor) {
    await recordAudit(db, {
      actorId: actor.id,
      action: 'dp.update',
      entityType: 'distribution_point',
      entityId: currentCode,
      summary: `Updated distribution point ${currentCode}`,
      detail: {
        nameEn,
        nameAr,
        district,
        active,
        latitude: gps.latitude,
        longitude: gps.longitude,
        gpsRadiusM: gps.gpsRadiusM,
        gpsCheckActive: gps.gpsCheckActive,
        userIds: input.userIds ?? null,
        renamedFrom: code.trim().toUpperCase() !== currentCode ? code : null,
      },
    })
  }
  return (
    row ?? {
      code: currentCode,
      nameEn,
      nameAr,
      district,
      active,
      latitude: gps.latitude,
      longitude: gps.longitude,
      gpsRadiusM: gps.gpsRadiusM,
      gpsCheckActive: gps.gpsCheckActive,
      householdCount: 0,
      assignedUsers: [],
    }
  )
}

export async function listUsers(db: Database) {
  const rows = await db.query(
    `SELECT id, username, display_name, role, active FROM users ORDER BY username`,
  )
  const links = await db.query(`SELECT user_id, dp_code FROM user_dps ORDER BY dp_code`)
  return rows.map((row) => ({
    id: String(row.id),
    username: String(row.role) === 'supervisor' ? '' : String(row.username),
    displayName: String(row.role) === 'supervisor' ? '' : String(row.display_name),
    role: String(row.role),
    active: asBool(row.active),
    dpCodes: links.filter((link) => link.user_id === row.id).map((link) => String(link.dp_code)),
  }))
}

async function assertPinAvailable(db: Queryable, pin: string, exceptUserId?: string) {
  const pins = await db.query<{ id: string; pin_hash: string }>(
    `SELECT id, pin_hash FROM users WHERE pin_hash IS NOT NULL`,
  )
  for (const row of pins) {
    if (exceptUserId && row.id === exceptUserId) continue
    if (verifySecret(pin, row.pin_hash)) throw new HttpError(400, 'pin_in_use')
  }
}

async function assertNotLastAdmin(db: Queryable, id: string) {
  const others = await db.query(`SELECT id FROM users WHERE role = 'admin' AND active = TRUE AND id <> $1`, [id])
  if (others.length === 0) throw new HttpError(400, 'last_admin')
}


export type AuditEntityType =
  | 'household'
  | 'card'
  | 'production'
  | 'user'
  | 'distribution_point'
  | 'card_template'
  | 'spot_check'
  | 'device'
  | 'system'

export interface AuditEntryInput {
  actorId: string | null
  action: string
  entityType: AuditEntityType
  entityId?: string | null
  summary: string
  detail?: Record<string, unknown>
}

export async function recordAudit(db: Queryable, entry: AuditEntryInput): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, summary, detail_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        crypto.randomUUID(),
        entry.actorId,
        entry.action.slice(0, 80),
        entry.entityType.slice(0, 40),
        entry.entityId == null ? null : String(entry.entityId).slice(0, 120),
        entry.summary.trim().slice(0, 400) || entry.action,
        JSON.stringify(entry.detail ?? {}),
      ],
    )
  } catch {
    // Never fail the primary write because audit insert failed (e.g. pre-migration).
  }
}

export async function listAdminActivity(
  db: Database,
  query: { q?: string; entityType?: string; limit?: number } = {},
) {
  const limit = Math.min(Math.max(Number(query.limit) || 200, 1), 500)
  const params: unknown[] = []
  const filters: string[] = []
  if (query.entityType?.trim()) {
    params.push(query.entityType.trim())
    filters.push(`a.entity_type = $${params.length}`)
  }
  if (query.q?.trim()) {
    const raw = `%${query.q.trim().replace(/[%_]/g, '')}%`
    params.push(raw)
    const p = params.length
    filters.push(
      `(a.summary ILIKE $${p} OR COALESCE(a.entity_id, '') ILIKE $${p} OR COALESCE(u.username, '') ILIKE $${p} OR COALESCE(u.display_name, '') ILIKE $${p} OR a.action ILIKE $${p})`,
    )
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
  params.push(limit)
  let rows: Row[] = []
  try {
    rows = await db.query(
      `SELECT a.id, a.created_at, a.actor_id, a.action, a.entity_type, a.entity_id, a.summary, a.detail_json,
              u.username, u.display_name, u.role
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.actor_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${params.length}`,
      params,
    )
  } catch {
    rows = []
  }

  // Supplement with recent production + card issuance so the feed is useful before new audits accumulate.
  const extras: Array<Record<string, unknown>> = []
  if (!query.entityType || query.entityType === 'production') {
    const prod = await db.query(
      `SELECT h.id, h.created_at, h.recorded_by AS actor_id, h.dp_code, h.production_date,
              h.meals_prepared, h.previous_meals_prepared, h.notes, u.username, u.display_name, u.role
       FROM daily_production_history h
       LEFT JOIN users u ON u.id = h.recorded_by
       ORDER BY h.created_at DESC LIMIT 80`,
    )
    for (const row of prod) {
      const prev = row.previous_meals_prepared == null ? null : Number(row.previous_meals_prepared)
      const next = Number(row.meals_prepared)
      extras.push({
        id: `prod:${row.id}`,
        createdAt: asText(row.created_at),
        actorId: row.actor_id == null ? null : String(row.actor_id),
        actorUsername: row.username == null ? null : String(row.username),
        actorDisplayName: row.display_name == null ? null : String(row.display_name),
        actorRole: row.role == null ? null : String(row.role),
        action: prev == null ? 'production.create' : 'production.update',
        entityType: 'production',
        entityId: `${row.dp_code}:${row.production_date}`,
        summary:
          prev == null
            ? `Meals prepared set to ${next} at ${row.dp_code} (${row.production_date})`
            : `Meals prepared ${prev} → ${next} at ${row.dp_code} (${row.production_date})`,
        detail: {
          dpCode: String(row.dp_code),
          productionDate: String(row.production_date),
          mealsPrepared: next,
          previousMealsPrepared: prev,
          notes: row.notes == null ? null : String(row.notes),
          source: 'daily_production_history',
        },
        source: 'legacy',
      })
    }
  }
  if (!query.entityType || query.entityType === 'card' || query.entityType === 'household') {
    const cards = await db.query(
      `SELECT c.id, c.created_at, c.operator_id AS actor_id, c.hh_code, c.card_code, c.action, c.reason,
              c.previous_card_code, u.username, u.display_name, u.role
       FROM card_issuance c
       LEFT JOIN users u ON u.id = c.operator_id
       ORDER BY c.created_at DESC LIMIT 80`,
    )
    for (const row of cards) {
      const action = String(row.action)
      extras.push({
        id: `card:${row.id}`,
        createdAt: asText(row.created_at),
        actorId: row.actor_id == null ? null : String(row.actor_id),
        actorUsername: row.username == null ? null : String(row.username),
        actorDisplayName: row.display_name == null ? null : String(row.display_name),
        actorRole: row.role == null ? null : String(row.role),
        action: `card.${action}`,
        entityType: 'card',
        entityId: String(row.hh_code),
        summary: `Card ${action} for ${row.hh_code}${row.reason ? ` — ${row.reason}` : ''}`,
        detail: {
          hhCode: String(row.hh_code),
          cardCode: String(row.card_code),
          previousCardCode: row.previous_card_code == null ? null : String(row.previous_card_code),
          reason: row.reason == null ? null : String(row.reason),
          source: 'card_issuance',
        },
        source: 'legacy',
      })
    }
  }

  const qLower = query.q?.trim().toLowerCase() || ''
  const primary = rows.map((row) => {
    let detail: Record<string, unknown> = {}
    try {
      detail = JSON.parse(String(row.detail_json || '{}')) as Record<string, unknown>
    } catch {
      detail = {}
    }
    return {
      id: String(row.id),
      createdAt: asText(row.created_at),
      actorId: row.actor_id == null ? null : String(row.actor_id),
      actorUsername: row.username == null ? null : String(row.username),
      actorDisplayName: row.display_name == null ? null : String(row.display_name),
      actorRole: row.role == null ? null : String(row.role),
      action: String(row.action),
      entityType: String(row.entity_type),
      entityId: row.entity_id == null ? null : String(row.entity_id),
      summary: String(row.summary),
      detail,
      source: 'audit_log',
    }
  })

  const filteredExtras = extras.filter((row) => {
    if (!qLower) return true
    const blob = `${row.summary} ${row.entityId} ${row.actorUsername} ${row.actorDisplayName} ${row.action}`.toLowerCase()
    return blob.includes(qLower)
  })

  const merged = [...primary, ...filteredExtras].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
  // Dedupe legacy card/production once mirrored into audit_log (same summary+time minute+entity)
  const seen = new Set<string>()
  const out = []
  for (const row of merged) {
    const key = `${row.source}:${row.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
    if (out.length >= limit) break
  }
  return out
}


export async function createUser(
  db: Database,
  input: { username: string; displayName: string; password: string; role: Role; dpCodes: string[]; pin?: string | null },
  actor?: Actor | null,
) {
  const username = input.username.trim().toLowerCase()
  if (input.role === 'supervisor' && !input.pin) throw new HttpError(400, 'pin_required')
  if (input.pin) await assertPinAvailable(db, input.pin)
  const id = crypto.randomUUID()
  const passwordHash = hashSecret(input.password)
  const pinHash = input.role === 'supervisor' && input.pin ? hashSecret(input.pin) : null
  await db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO users (id, username, display_name, password_hash, pin_hash, role)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, username, input.displayName.trim(), passwordHash, pinHash, input.role],
    )
    for (const dpCode of input.dpCodes) {
      await assertActiveDp(tx, dpCode.toUpperCase())
      await tx.query(`INSERT INTO user_dps (user_id, dp_code) VALUES ($1, $2)`, [id, dpCode.toUpperCase()])
    }
  })
  if (actor) {
    await recordAudit(db, {
      actorId: actor.id,
      action: 'user.create',
      entityType: 'user',
      entityId: id,
      summary: `Created user ${username} (${input.role})`,
      detail: { username, role: input.role, dpCodes: input.dpCodes, displayName: input.displayName.trim() },
    })
  }
  return { id, username }
}

export interface UserUpdate {
  displayName?: string
  username?: string
  role?: Role
  password?: string
  pin?: string | null
  dpCodes?: string[]
  active?: boolean
}

export async function updateUser(db: Database, id: string, input: UserUpdate, actor?: Actor | null) {
  const rows = await db.query<{ role: string; pin_hash: string | null }>(`SELECT role, pin_hash FROM users WHERE id = $1`, [id])
  const current = rows[0]
  if (!current) throw new HttpError(404, 'not_found')
  const nextRole = input.role ?? (current.role as Role)
  if (current.role === 'admin' && (input.active === false || nextRole !== 'admin')) await assertNotLastAdmin(db, id)
  if (nextRole === 'supervisor' && !input.pin && !current.pin_hash) throw new HttpError(400, 'pin_required')
  if (input.pin) await assertPinAvailable(db, input.pin, id)
  if (input.username) {
    const username = input.username.trim().toLowerCase()
    const clash = await db.query(`SELECT id FROM users WHERE username = $1 AND id <> $2`, [username, id])
    if (clash[0]) throw new HttpError(409, 'username_taken')
  }
  await db.transaction(async (tx) => {
    if (input.displayName) await tx.query(`UPDATE users SET display_name = $2 WHERE id = $1`, [id, input.displayName.trim()])
    if (input.username) await tx.query(`UPDATE users SET username = $2 WHERE id = $1`, [id, input.username.trim().toLowerCase()])
    if (input.role) await tx.query(`UPDATE users SET role = $2 WHERE id = $1`, [id, input.role])
    if (input.password) await tx.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [id, hashSecret(input.password)])
    if (typeof input.active === 'boolean') await tx.query(`UPDATE users SET active = $2 WHERE id = $1`, [id, input.active])
    if (nextRole !== 'supervisor') await tx.query(`UPDATE users SET pin_hash = NULL WHERE id = $1`, [id])
    else if (input.pin) await tx.query(`UPDATE users SET pin_hash = $2 WHERE id = $1`, [id, hashSecret(input.pin)])
    if (input.dpCodes) {
      await tx.query(`DELETE FROM user_dps WHERE user_id = $1`, [id])
      for (const code of input.dpCodes) {
        await assertActiveDp(tx, code.toUpperCase())
        await tx.query(`INSERT INTO user_dps (user_id, dp_code) VALUES ($1, $2)`, [id, code.toUpperCase()])
      }
    }
  })
  if (actor) {
    await recordAudit(db, {
      actorId: actor.id,
      action: 'user.update',
      entityType: 'user',
      entityId: id,
      summary: `Updated user ${id}`,
      detail: {
        displayName: input.displayName ?? null,
        username: input.username ?? null,
        role: input.role ?? null,
        active: input.active ?? null,
        dpCodes: input.dpCodes ?? null,
        passwordChanged: Boolean(input.password),
        pinChanged: input.pin !== undefined,
      },
    })
  }
  return { id }
}

export async function deleteUser(db: Database, actorId: string, id: string) {
  if (actorId === id) throw new HttpError(400, 'cannot_delete_self')
  const rows = await db.query<{ role: string }>(`SELECT role FROM users WHERE id = $1`, [id])
  if (!rows[0]) throw new HttpError(404, 'not_found')
  if (rows[0].role === 'admin') await assertNotLastAdmin(db, id)
  const history = await db.query(
    `SELECT 1 AS hit FROM meal_scans WHERE operator_id = $1 OR supervisor_id = $1
     UNION ALL SELECT 1 FROM card_issuance WHERE operator_id = $1
     UNION ALL SELECT 1 FROM households WHERE registered_by = $1
     UNION ALL SELECT 1 FROM daily_production WHERE recorded_by = $1
     UNION ALL SELECT 1 FROM daily_production_history WHERE recorded_by = $1
     UNION ALL SELECT 1 FROM spot_checks WHERE supervisor_id = $1
     LIMIT 1`,
    [id],
  )
  if (history[0]) throw new HttpError(409, 'user_has_records')
  await db.transaction(async (tx) => {
    await tx.query(`UPDATE devices SET last_user_id = NULL WHERE last_user_id = $1`, [id])
    await tx.query(`UPDATE sync_log SET operator_id = NULL WHERE operator_id = $1`, [id])
    await tx.query(`DELETE FROM users WHERE id = $1`, [id])
  })
  await recordAudit(db, {
    actorId: actorId,
    action: 'user.delete',
    entityType: 'user',
    entityId: id,
    summary: `Deleted user ${id}`,
    detail: { role: String(rows[0].role) },
  })
  return { id }
}

export async function listDevices(db: Database) {
  const rows = await db.query(
    `SELECT device_id, label, last_user_id, last_seen_at, active FROM devices ORDER BY last_seen_at DESC NULLS LAST`,
  )
  return rows.map((row) => ({
    deviceId: String(row.device_id),
    label: String(row.label),
    lastUserId: row.last_user_id == null ? null : String(row.last_user_id),
    lastSeenAt: asText(row.last_seen_at),
    active: asBool(row.active),
  }))
}

export interface ReportFilters {
  from: string
  to: string
  dp?: string
  district?: string
  operator?: string
}

/** MEAL reports: prepared vs served, scans by DP/district/focal point, overrides, voids/reissues. */
export async function reports(db: Database, actor: Actor, filters: ReportFilters) {
  if (actor.role === 'dp_focal') throw new HttpError(403, 'forbidden')
  if (filters.from > filters.to) throw new HttpError(400, 'invalid_body')
  const accessible = await accessibleDpCodes(db, actor)
  const dpMeta = await db.query(
    `SELECT code, name_en, name_ar, district FROM distribution_points WHERE code = ANY($1::text[]) ORDER BY code`,
    [accessible],
  )
  let codes = dpMeta.map((r) => String(r.code))
  if (filters.dp) codes = codes.filter((c) => c === filters.dp!.toUpperCase())
  if (filters.district) {
    codes = codes.filter((c) => String(dpMeta.find((r) => r.code === c)?.district) === filters.district)
  }
  const operator = filters.operator || null
  const scanArgs = [codes, filters.from, filters.to, operator]
  const scanWhere = `s.dp_code = ANY($1::text[]) AND s.scan_date BETWEEN $2 AND $3 AND ($4::text IS NULL OR s.operator_id = $4)`

  const scanAgg = `
    COUNT(*) FILTER (WHERE s.counts_as_distributed) AS served,
    COUNT(*) FILTER (WHERE s.result = 'Blocked') AS blocked,
    COUNT(*) FILTER (WHERE s.result = 'Override') AS overrides,
    COUNT(*) FILTER (WHERE s.result = 'ManualException') AS manual,
    COUNT(*) FILTER (WHERE s.offline_flag) AS offline,
    COUNT(DISTINCT s.hh_code) FILTER (WHERE s.counts_as_distributed) AS unique_hh,
    COUNT(*) AS scans`

  const [byDpScan, byDayScan, byOpScan, prodByDp, prodByDay, cardActs, blockReasons, operators] = await Promise.all([
    db.query(`SELECT s.dp_code, ${scanAgg} FROM meal_scans s WHERE ${scanWhere} GROUP BY s.dp_code`, scanArgs),
    db.query(`SELECT s.scan_date AS d, ${scanAgg} FROM meal_scans s WHERE ${scanWhere} GROUP BY s.scan_date`, scanArgs),
    db.query(
      `SELECT s.operator_id, u.display_name, u.username, u.role, ${scanAgg}
       FROM meal_scans s JOIN users u ON u.id = s.operator_id WHERE ${scanWhere}
       GROUP BY s.operator_id, u.display_name, u.username, u.role ORDER BY served DESC`,
      scanArgs,
    ),
    db.query(
      `SELECT dp_code, SUM(meals_prepared) AS prepared, COUNT(*) AS days FROM daily_production
       WHERE dp_code = ANY($1::text[]) AND production_date BETWEEN $2 AND $3 GROUP BY dp_code`,
      [codes, filters.from, filters.to],
    ),
    db.query(
      `SELECT production_date AS d, SUM(meals_prepared) AS prepared FROM daily_production
       WHERE dp_code = ANY($1::text[]) AND production_date BETWEEN $2 AND $3 GROUP BY production_date`,
      [codes, filters.from, filters.to],
    ),
    db.query(
      `SELECT h.dp_code, ci.action, COUNT(*) AS n FROM card_issuance ci JOIN households h ON h.hh_code = ci.hh_code
       WHERE h.dp_code = ANY($1::text[]) AND (ci.created_at AT TIME ZONE 'Asia/Aden')::date BETWEEN $2::date AND $3::date
       GROUP BY h.dp_code, ci.action`,
      [codes, filters.from, filters.to],
    ),
    db.query(
      `SELECT COALESCE(s.block_reason, 'other') AS reason, COUNT(*) AS n FROM meal_scans s
       WHERE ${scanWhere} AND s.result = 'Blocked' GROUP BY 1 ORDER BY n DESC`,
      scanArgs,
    ),
    db.query(
      `SELECT DISTINCT u.id, u.display_name, u.username, u.role FROM users u
       LEFT JOIN user_dps ud ON ud.user_id = u.id
       WHERE u.role IN ('dp_focal','supervisor') AND (ud.dp_code = ANY($1::text[]) OR $2::boolean)
       ORDER BY u.display_name`,
      [accessible, actor.role === 'admin'],
    ),
  ])

  const num = (v: unknown) => Number(v ?? 0)
  const hhRows = await db.query(
    `SELECT dp_code, COUNT(*) FILTER (WHERE active_card_code IS NOT NULL) AS active_cards,
            COALESCE(SUM(beneficiary_count) FILTER (WHERE active_card_code IS NOT NULL), 0) AS people
     FROM households WHERE dp_code = ANY($1::text[]) GROUP BY dp_code`,
    [codes],
  )

  const byDp = codes.map((code) => {
    const meta = dpMeta.find((r) => r.code === code)!
    const s = byDpScan.find((r) => r.dp_code === code)
    const p = prodByDp.find((r) => r.dp_code === code)
    const hh = hhRows.find((r) => r.dp_code === code)
    const act = (a: string) => num(cardActs.find((r) => r.dp_code === code && r.action === a)?.n)
    const prepared = p ? num(p.prepared) : null
    const served = num(s?.served)
    return {
      dpCode: code,
      nameEn: String(meta.name_en),
      nameAr: String(meta.name_ar),
      district: String(meta.district),
      activeCards: num(hh?.active_cards),
      people: num(hh?.people),
      productionDays: num(p?.days),
      prepared,
      served,
      variance: prepared == null ? null : prepared - served,
      blocked: num(s?.blocked),
      overrides: num(s?.overrides),
      manual: num(s?.manual),
      offline: num(s?.offline),
      scans: num(s?.scans),
      uniqueHh: num(s?.unique_hh),
      issued: act('issue'),
      voided: act('void'),
      reissued: act('reissue'),
    }
  })

  const districts = [...new Set(byDp.map((r) => r.district))].map((district) => {
    const rows = byDp.filter((r) => r.district === district)
    const sum = (k: keyof (typeof rows)[number]) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0)
    const prepared = rows.some((r) => r.prepared != null) ? sum('prepared') : null
    const served = sum('served')
    return {
      district,
      dps: rows.length,
      activeCards: sum('activeCards'),
      prepared,
      served,
      variance: prepared == null ? null : prepared - served,
      blocked: sum('blocked'),
      overrides: sum('overrides'),
      voided: sum('voided'),
      reissued: sum('reissued'),
    }
  })

  const days: string[] = []
  for (let d = new Date(`${filters.from}T00:00:00Z`); d <= new Date(`${filters.to}T00:00:00Z`) && days.length < 400; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10))
  }
  const byDay = days.map((d) => {
    const s = byDayScan.find((r) => String(r.d) === d)
    const p = prodByDay.find((r) => String(r.d) === d)
    const prepared = p ? num(p.prepared) : null
    const served = num(s?.served)
    return {
      date: d,
      prepared,
      served,
      variance: prepared == null ? null : prepared - served,
      blocked: num(s?.blocked),
      overrides: num(s?.overrides),
      uniqueHh: num(s?.unique_hh),
    }
  })

  const total = (k: keyof (typeof byDp)[number]) => byDp.reduce((a, r) => a + Number(r[k] ?? 0), 0)
  const uniqueRow = await db.query(
    `SELECT COUNT(DISTINCT s.hh_code) AS n FROM meal_scans s WHERE ${scanWhere} AND s.counts_as_distributed`,
    scanArgs,
  )
  const uniqueAll = num(uniqueRow[0]?.n)
  const preparedTotal = byDp.some((r) => r.prepared != null) ? total('prepared') : null
  const servedTotal = total('served')
  return {
    filters,
    options: {
      dps: dpMeta.map((r) => ({ code: String(r.code), nameEn: String(r.name_en), nameAr: String(r.name_ar), district: String(r.district) })),
      districts: [...new Set(dpMeta.map((r) => String(r.district)))],
      operators: operators.map((r) => ({ id: String(r.id), name: String(r.display_name || r.username), role: String(r.role) })),
    },
    totals: {
      activeCards: total('activeCards'),
      people: total('people'),
      prepared: preparedTotal,
      served: servedTotal,
      variance: preparedTotal == null ? null : preparedTotal - servedTotal,
      coveragePct: preparedTotal ? Math.round((servedTotal / preparedTotal) * 1000) / 10 : null,
      blocked: total('blocked'),
      overrides: total('overrides'),
      manual: total('manual'),
      offline: total('offline'),
      scans: total('scans'),
      uniqueHh: uniqueAll,
      activeDps: byDp.filter((r) => r.scans > 0 || r.prepared != null).length,
      totalDps: byDp.length,
      issued: total('issued'),
      voided: total('voided'),
      reissued: total('reissued'),
      days: days.length,
    },
    byDay,
    byDp,
    byDistrict: districts,
    byOperator: byOpScan.map((r) => ({
      id: String(r.operator_id),
      name: String(r.display_name || r.username),
      role: String(r.role),
      served: num(r.served),
      blocked: num(r.blocked),
      overrides: num(r.overrides),
      manual: num(r.manual),
      offline: num(r.offline),
      scans: num(r.scans),
    })),
    blockReasons: blockReasons.map((r) => ({ reason: String(r.reason), count: num(r.n) })),
  }
}
