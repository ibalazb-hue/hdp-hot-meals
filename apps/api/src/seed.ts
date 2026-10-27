import { formatHhCode, hashSecret, TRAINING_PASSWORD, TRAINING_PIN } from '@hdp/rules'
import type { Database } from './db.js'

export const TRAINING_USERS = {
  focalMudhaffar: '11111111-1111-4111-8111-111111111111',
  focalQahira: '22222222-2222-4222-8222-222222222222',
  meal: '33333333-3333-4333-8333-333333333333',
  supervisor: '44444444-4444-4444-8444-444444444444',
  admin: '55555555-5555-4555-8555-555555555555',
} as const

const POINTS: Array<[string, string, string, 'Al-Mudhaffar' | 'Al-Qahira']> = [
  ['MDF01', 'Mudhaffar Central', 'المظفر المركزي', 'Al-Mudhaffar'],
  ['MDF02', 'Al-Hasab', 'الحصب', 'Al-Mudhaffar'],
  ['MDF03', 'Sinai', 'سيناء', 'Al-Mudhaffar'],
  ['MDF04', 'Al-Jahmaliyah', 'الجمالية', 'Al-Mudhaffar'],
  ['MDF05', 'Wadi Al-Qadi', 'وادي القاضي', 'Al-Mudhaffar'],
  ['QAH01', 'Qahira Central', 'القاهرة المركزي', 'Al-Qahira'],
  ['QAH02', 'Al-Thawra', 'الثورة', 'Al-Qahira'],
  ['QAH03', 'Al-Rawdah', 'الروضة', 'Al-Qahira'],
  ['QAH04', 'Hawdh Al-Ashraf', 'حوض الأشراف', 'Al-Qahira'],
  ['QAH05', 'Al-Muroor', 'المرور', 'Al-Qahira'],
]

let hashes: { password: string; pin: string } | undefined

function trainingHashes() {
  hashes ??= { password: hashSecret(TRAINING_PASSWORD), pin: hashSecret(TRAINING_PIN) }
  return hashes
}

export async function seed(db: Database): Promise<void> {
  const existing = await db.query('SELECT id FROM users LIMIT 1')
  if (existing.length > 0) return

  const { password, pin } = trainingHashes()
  const allCodes = POINTS.map(([code]) => code)

  for (const [code, nameEn, nameAr, district] of POINTS) {
    await db.query(
      `INSERT INTO distribution_points (code, name_en, name_ar, district) VALUES ($1, $2, $3, $4)`,
      [code, nameEn, nameAr, district],
    )
    await db.query(`INSERT INTO hh_counters (dp_code, last_number) VALUES ($1, 0)`, [code])
  }

  const users: Array<[string, string, string, string, string | null, string]> = [
    [TRAINING_USERS.focalMudhaffar, 'focal.mudhaffar', 'Mudhaffar focal', 'dp_focal', null, password],
    [TRAINING_USERS.focalQahira, 'focal.qahira', 'Qahira focal', 'dp_focal', null, password],
    [TRAINING_USERS.meal, 'meal.taiz', 'Taiz registration', 'meal', null, password],
    [TRAINING_USERS.supervisor, 'supervisor.taiz', 'Taiz supervisor', 'supervisor', pin, password],
    [TRAINING_USERS.admin, 'admin.taiz', 'Taiz admin', 'admin', null, password],
  ]
  for (const [id, username, displayName, role, pinHash, passwordHash] of users) {
    await db.query(
      `INSERT INTO users (id, username, display_name, password_hash, pin_hash, role) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, username, displayName, passwordHash, pinHash, role],
    )
  }

  const assignments: Array<[string, string[]]> = [
    [TRAINING_USERS.focalMudhaffar, ['MDF01', 'MDF02']],
    [TRAINING_USERS.focalQahira, ['QAH01']],
    [TRAINING_USERS.meal, allCodes],
    [TRAINING_USERS.supervisor, allCodes],
    [TRAINING_USERS.admin, allCodes],
  ]
  for (const [userId, codes] of assignments) {
    for (const dpCode of codes) {
      await db.query(`INSERT INTO user_dps (user_id, dp_code) VALUES ($1, $2)`, [userId, dpCode])
    }
  }

  const samples = [
    { hh: 'TZ-MDF01-000101', dp: 'MDF01', n: 101, card: 'CMDF01000101', count: 6, label: 'Sample A' },
    { hh: 'TZ-MDF01-000102', dp: 'MDF01', n: 102, card: 'CMDF01000102', count: 4, label: 'Sample B' },
    { hh: 'TZ-MDF01-000103', dp: 'MDF01', n: 103, card: null, voided: 'CMDF01000103', count: 5, label: 'Sample voided' },
    { hh: 'TZ-QAH01-000201', dp: 'QAH01', n: 201, card: 'CQAH01000201', count: 7, label: 'Sample Qahira' },
  ]
  for (const sample of samples) {
    if (formatHhCode(sample.dp, sample.n) !== sample.hh) {
      throw new Error(`Seed code mismatch for ${sample.hh}`)
    }
    await db.query(
      `INSERT INTO households (hh_code, dp_code, beneficiary_count, label, active_card_code, registered_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sample.hh, sample.dp, sample.count, sample.label, sample.card, TRAINING_USERS.meal],
    )
    if (sample.card) {
      await db.query(
        `INSERT INTO card_issuance (id, hh_code, card_code, action, reason, operator_id)
         VALUES ($1, $2, $3, 'issue', 'Training issue', $4)`,
        [crypto.randomUUID(), sample.hh, sample.card, TRAINING_USERS.meal],
      )
    }
    if ('voided' in sample && sample.voided) {
      await db.query(
        `INSERT INTO card_issuance (id, hh_code, card_code, action, reason, operator_id)
         VALUES ($1, $2, $3, 'void', 'Training void — lost card', $4)`,
        [crypto.randomUUID(), sample.hh, sample.voided, TRAINING_USERS.meal],
      )
    }
  }
  await db.query(`UPDATE hh_counters SET last_number = 103 WHERE dp_code = 'MDF01'`)
  await db.query(`UPDATE hh_counters SET last_number = 201 WHERE dp_code = 'QAH01'`)
}
