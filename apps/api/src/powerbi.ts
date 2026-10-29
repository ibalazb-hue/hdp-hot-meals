import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Database } from './db.js'
import { HttpError, recordAudit, type Actor } from './domain.js'

/**
 * Read-only data feed for Power BI / Excel (Get data → Web).
 * Auth: a rotating API key (stored hashed in app_settings) passed as
 * `?key=` or `X-API-Key` header; or a normal admin/meal bearer token.
 */
const KEY_SETTING = 'powerbi_api_key'

const sha = (v: string) => createHash('sha256').update(v).digest('hex')

export async function powerBiKeyStatus(db: Database) {
  const rows = await db.query(`SELECT value_json, updated_at FROM app_settings WHERE key = $1`, [KEY_SETTING])
  if (!rows[0]) return { enabled: false, createdAt: null, prefix: null }
  const v = JSON.parse(String(rows[0].value_json)) as { hash: string; prefix: string }
  return { enabled: true, createdAt: String(rows[0].updated_at), prefix: v.prefix }
}

export async function rotatePowerBiKey(db: Database, actor: Actor) {
  if (actor.role !== 'admin') throw new HttpError(403, 'forbidden')
  const key = `hdpbi_${randomBytes(24).toString('base64url')}`
  const value = JSON.stringify({ hash: sha(key), prefix: key.slice(0, 10) })
  await db.query(
    `INSERT INTO app_settings (key, value_json, updated_at, updated_by) VALUES ($1, $2, now(), $3)
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [KEY_SETTING, value, actor.id],
  )
  await recordAudit(db, {
    actorId: actor.id,
    action: 'powerbi_key.rotate',
    entityType: 'system',
    entityId: KEY_SETTING,
    summary: 'Power BI data feed key generated (previous key revoked)',
  })
  return { key, ...(await powerBiKeyStatus(db)) }
}

export async function revokePowerBiKey(db: Database, actor: Actor) {
  if (actor.role !== 'admin') throw new HttpError(403, 'forbidden')
  await db.query(`DELETE FROM app_settings WHERE key = $1`, [KEY_SETTING])
  await recordAudit(db, {
    actorId: actor.id,
    action: 'powerbi_key.revoke',
    entityType: 'system',
    entityId: KEY_SETTING,
    summary: 'Power BI data feed key revoked',
  })
  return { enabled: false }
}

export async function verifyPowerBiKey(db: Database, key: string): Promise<boolean> {
  if (!key || key.length < 20) return false
  const rows = await db.query(`SELECT value_json FROM app_settings WHERE key = $1`, [KEY_SETTING])
  if (!rows[0]) return false
  const { hash } = JSON.parse(String(rows[0].value_json)) as { hash: string }
  const a = Buffer.from(sha(key), 'hex')
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface FeedFilters {
  from?: string
  to?: string
  dp?: string
  district?: string
  operator?: string
}

const MAX_ROWS = 250000

function dpClause(alias: string, f: FeedFilters, args: unknown[]) {
  const parts: string[] = []
  if (f.dp) {
    args.push(f.dp.toUpperCase())
    parts.push(`${alias}.dp_code = $${args.length}`)
  }
  if (f.district) {
    args.push(f.district)
    parts.push(`${alias}.dp_code IN (SELECT code FROM distribution_points WHERE district = $${args.length})`)
  }
  return parts
}

function dateClause(col: string, f: FeedFilters, args: unknown[]) {
  const parts: string[] = []
  if (f.from) {
    args.push(f.from)
    parts.push(`${col} >= $${args.length}`)
  }
  if (f.to) {
    args.push(f.to)
    parts.push(`${col} <= $${args.length}`)
  }
  return parts
}

const where = (parts: string[]) => (parts.length ? `WHERE ${parts.join(' AND ')}` : '')

export const FEEDS = ['distribution_points', 'focal_points', 'households', 'production', 'scans', 'daily', 'cards'] as const
export type FeedName = (typeof FEEDS)[number]

export async function feed(db: Database, name: FeedName, f: FeedFilters): Promise<Array<Record<string, unknown>>> {
  const args: unknown[] = []
  switch (name) {
    case 'distribution_points':
      return db.query(
        `SELECT code AS dp_code, name_en, name_ar, district, active, latitude, longitude, gps_radius_m
         FROM distribution_points ORDER BY code`,
      )
    case 'focal_points':
      // No password/PIN hashes; staff identity + assigned DPs only.
      return db.query(
        `SELECT u.id AS user_id, u.display_name, u.username, u.role, u.active,
                COALESCE(string_agg(ud.dp_code, ';' ORDER BY ud.dp_code), '') AS dp_codes
         FROM users u LEFT JOIN user_dps ud ON ud.user_id = u.id
         GROUP BY u.id, u.display_name, u.username, u.role, u.active ORDER BY u.display_name`,
      )
    case 'households': {
      // Holder names deliberately excluded (PII). Use hh_code as the key.
      const parts = dpClause('h', f, args)
      return db.query(
        `SELECT h.hh_code, h.dp_code, d.district, h.beneficiary_count, h.status,
                (h.active_card_code IS NOT NULL) AS has_active_card, h.created_at, h.updated_at
         FROM households h JOIN distribution_points d ON d.code = h.dp_code
         ${where(parts)} ORDER BY h.hh_code LIMIT ${MAX_ROWS}`,
        args,
      )
    }
    case 'production': {
      const parts = [...dpClause('p', f, args), ...dateClause('p.production_date', f, args)]
      return db.query(
        `SELECT p.production_date AS date, p.dp_code, d.district, p.meals_prepared, u.display_name AS recorded_by, p.notes, p.updated_at
         FROM daily_production p JOIN distribution_points d ON d.code = p.dp_code JOIN users u ON u.id = p.recorded_by
         ${where(parts)} ORDER BY p.production_date, p.dp_code`,
        args,
      )
    }
    case 'scans': {
      const parts = [...dpClause('s', f, args), ...dateClause('s.scan_date', f, args)]
      if (f.operator) {
        args.push(f.operator)
        parts.push(`s.operator_id = $${args.length}`)
      }
      return db.query(
        `SELECT s.id AS scan_id, s.scan_date AS date, s.scanned_at, s.dp_code, d.district, s.hh_code, s.mode, s.result,
                s.block_reason, s.counts_as_distributed AS served, s.offline_flag AS offline,
                s.operator_id, u.display_name AS operator_name, s.supervisor_id, s.override_reason, s.device_id, s.synced_at
         FROM meal_scans s JOIN distribution_points d ON d.code = s.dp_code JOIN users u ON u.id = s.operator_id
         ${where(parts)} ORDER BY s.scanned_at LIMIT ${MAX_ROWS}`,
        args,
      )
    }
    case 'daily': {
      // One row per DP per day with prepared vs served (FULL JOIN so either side may be missing).
      const sArgs: unknown[] = []
      const sParts = [...dpClause('s', f, sArgs), ...dateClause('s.scan_date', f, sArgs)]
      const n = sArgs.length
      const pParts = [...dpClause('p', f, sArgs), ...dateClause('p.production_date', f, sArgs)]
      void n
      return db.query(
        `WITH sv AS (
           SELECT s.dp_code, s.scan_date AS date,
                  COUNT(*) FILTER (WHERE s.counts_as_distributed) AS served,
                  COUNT(DISTINCT s.hh_code) FILTER (WHERE s.counts_as_distributed) AS unique_hh,
                  COUNT(*) FILTER (WHERE s.result = 'Blocked') AS blocked,
                  COUNT(*) FILTER (WHERE s.result = 'Override') AS overrides,
                  COUNT(*) FILTER (WHERE s.offline_flag) AS offline
           FROM meal_scans s ${where(sParts)} GROUP BY s.dp_code, s.scan_date
         ), pr AS (
           SELECT p.dp_code, p.production_date AS date, p.meals_prepared FROM daily_production p ${where(pParts)}
         )
         SELECT COALESCE(sv.date, pr.date) AS date, COALESCE(sv.dp_code, pr.dp_code) AS dp_code, d.district,
                pr.meals_prepared AS prepared, COALESCE(sv.served, 0) AS served,
                CASE WHEN pr.meals_prepared IS NULL THEN NULL ELSE pr.meals_prepared - COALESCE(sv.served, 0) END AS variance,
                COALESCE(sv.unique_hh, 0) AS unique_hh, COALESCE(sv.blocked, 0) AS blocked,
                COALESCE(sv.overrides, 0) AS overrides, COALESCE(sv.offline, 0) AS offline
         FROM sv FULL OUTER JOIN pr ON pr.dp_code = sv.dp_code AND pr.date = sv.date
         JOIN distribution_points d ON d.code = COALESCE(sv.dp_code, pr.dp_code)
         ORDER BY 1, 2`,
        sArgs,
      )
    }
    case 'cards': {
      const parts = dpClause('h', f, args)
      if (f.from) {
        args.push(f.from)
        parts.push(`(ci.created_at AT TIME ZONE 'Asia/Aden')::date >= $${args.length}::date`)
      }
      if (f.to) {
        args.push(f.to)
        parts.push(`(ci.created_at AT TIME ZONE 'Asia/Aden')::date <= $${args.length}::date`)
      }
      return db.query(
        `SELECT ci.id, (ci.created_at AT TIME ZONE 'Asia/Aden')::date::text AS date, ci.created_at, ci.hh_code, h.dp_code, d.district,
                ci.action, ci.reason, u.display_name AS operator_name
         FROM card_issuance ci JOIN households h ON h.hh_code = ci.hh_code
         JOIN distribution_points d ON d.code = h.dp_code JOIN users u ON u.id = ci.operator_id
         ${where(parts)} ORDER BY ci.created_at LIMIT ${MAX_ROWS}`,
        args,
      )
    }
  }
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return '\ufeff'
  const cols = Object.keys(rows[0])
  const cell = (v: unknown) => {
    if (v == null) return ''
    const s = v instanceof Date ? v.toISOString() : String(v)
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  return '\ufeff' + [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n')
}
