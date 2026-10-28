import Dexie, { type Table } from 'dexie'
import type { BlockReason, Role, ScanResult } from '@hdp/rules'

export interface SessionUser {
  id: string
  username: string
  displayName: string
  role: Role
  dpCodes: string[]
}

export interface Session {
  token: string
  expiresAt: string
  user: SessionUser
}

export interface LocalHousehold {
  hhCode: string
  dpCode: string
  status: 'active' | 'inactive'
  activeCardCode: string | null
  beneficiaryCount: number
}

export interface LocalScan {
  id: string
  hhCode: string | null
  cardCode: string | null
  dpCode: string
  scanDate: string
  scannedAt: string
  mode: 'card' | 'manual'
  clientResult: ScanResult
  clientBlockReason: BlockReason | null
  result: ScanResult
  blockReason: BlockReason | null
  countsAsDistributed: boolean
  overrideReason: string | null
  supervisorPin: string | null
  operatorId: string
  operatorUsername: string
  deviceId: string
  offlineFlag: boolean
  synced: 0 | 1
  syncError: string | null
  conflictNote: string | null
  messageKey: string
  latitude: number | null
  longitude: number | null
  locationAccuracyM: number | null
}

export interface ServedRow {
  key: string
  hhCode: string
  scanDate: string
  scannedAt: string
  clientScanId: string
  result: string
  dpCode: string
}

class HdpDB extends Dexie {
  households!: Table<LocalHousehold, string>
  voidedCards!: Table<{ cardCode: string; hhCode: string }, string>
  served!: Table<ServedRow, string>
  scans!: Table<LocalScan, string>
  dps!: Table<{ code: string; nameEn: string; nameAr: string; district: string; latitude: number | null; longitude: number | null; gpsRadiusM: number; gpsCheckActive: boolean }, string>
  pins!: Table<{ userId: string; username: string; displayName: string; pinHash: string }, string>
  meta!: Table<{ key: string; value: string }, string>

  constructor() {
    super('hdp-taiz')
    this.version(1).stores({
      households: 'hhCode, dpCode, activeCardCode',
      voidedCards: 'cardCode, hhCode',
      served: 'key, hhCode, scanDate, clientScanId',
      scans: 'id, scanDate, synced, hhCode, operatorId',
      dps: 'code',
      pins: 'userId',
      meta: 'key',
    })
  }
}

export const db = new HdpDB()

export async function getSession(): Promise<Session | null> {
  const row = await db.meta.get('session')
  if (!row) return null
  try {
    return JSON.parse(row.value) as Session
  } catch {
    return null
  }
}

export async function saveSession(session: Session): Promise<void> {
  await db.meta.put({ key: 'session', value: JSON.stringify(session) })
}

export async function clearSession(): Promise<void> {
  await db.meta.delete('session')
}

export async function deviceId(): Promise<string> {
  const row = await db.meta.get('deviceId')
  if (row?.value) return row.value
  const id = crypto.randomUUID()
  await db.meta.put({ key: 'deviceId', value: id })
  return id
}

export async function rememberServed(scan: Pick<LocalScan, 'hhCode' | 'scanDate' | 'scannedAt' | 'id' | 'result' | 'dpCode'>): Promise<void> {
  if (!scan.hhCode) return
  await db.served.put({
    key: `${scan.hhCode}|${scan.scanDate}`,
    hhCode: scan.hhCode,
    scanDate: scan.scanDate,
    scannedAt: scan.scannedAt,
    clientScanId: scan.id,
    result: scan.result,
    dpCode: scan.dpCode,
  })
}

export async function forgetServed(scanId: string): Promise<void> {
  const rows = await db.served.where('clientScanId').equals(scanId).toArray()
  await db.served.bulkDelete(rows.map((row) => row.key))
}
