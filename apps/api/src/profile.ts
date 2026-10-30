import { z } from 'zod'
import type { Row } from './db.js'

/** Pre-registration household profile fields (paper form → households columns). */
export const PROFILE_FIELDS = [
  { key: 'headName', col: 'head_name', type: 'text', max: 80 },
  { key: 'spouseName', col: 'spouse_name', type: 'text', max: 80 },
  { key: 'headGender', col: 'head_gender', type: 'enum', values: ['male', 'female'] },
  { key: 'headAge', col: 'head_age', type: 'int', min: 10, max: 120 },
  { key: 'idNumber', col: 'id_number', type: 'text', max: 40 },
  { key: 'phone', col: 'phone', type: 'text', max: 30 },
  { key: 'males', col: 'males_count', type: 'int', min: 0, max: 30 },
  { key: 'females', col: 'females_count', type: 'int', min: 0, max: 30 },
  { key: 'hasPlw', col: 'has_plw', type: 'bool' },
  { key: 'hasDisability', col: 'has_disability', type: 'bool' },
  { key: 'hasElderly', col: 'has_elderly', type: 'bool' },
  { key: 'displacementStatus', col: 'displacement_status', type: 'enum', values: ['idp', 'host', 'returnee'] },
  { key: 'femaleHeaded', col: 'female_headed', type: 'bool' },
  { key: 'noCookingMeans', col: 'no_cooking_means', type: 'bool' },
  { key: 'specialArrangements', col: 'special_arrangements', type: 'bool' },
  { key: 'eligibilityCardStatus', col: 'eligibility_card_status', type: 'enum', values: ['disability', 'elderly', 'none'] },
  { key: 'locationName', col: 'location_name', type: 'text', max: 120 },
  { key: 'remarks', col: 'remarks', type: 'text', max: 300 },
  { key: 'registrationDate', col: 'registration_date', type: 'date' },
] as const

export type ProfileKey = (typeof PROFILE_FIELDS)[number]['key']
export type Profile = Partial<Record<ProfileKey, string | number | boolean | null>>

export function profileSchema() {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const f of PROFILE_FIELDS) {
    if (f.type === 'text') shape[f.key] = z.string().max(f.max).nullish()
    else if (f.type === 'int') shape[f.key] = z.number().int().min(f.min).max(f.max).nullish()
    else if (f.type === 'bool') shape[f.key] = z.boolean().nullish()
    else if (f.type === 'date') shape[f.key] = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish()
    else shape[f.key] = z.enum(f.values as unknown as [string, ...string[]]).nullish()
  }
  return shape
}

/** Only keys present in input (undefined = leave unchanged; null/'' = clear). */
export function cleanProfile(input: Record<string, unknown>): Array<{ col: string; key: string; value: unknown }> {
  const out: Array<{ col: string; key: string; value: unknown }> = []
  for (const f of PROFILE_FIELDS) {
    if (!(f.key in input) || input[f.key] === undefined) continue
    let v = input[f.key]
    if (typeof v === 'string') {
      v = v.replace(/[\r\n]+/g, ' ').trim()
      if (v === '') v = null
    }
    out.push({ col: f.col, key: f.key, value: v ?? null })
  }
  return out
}

export function profileFromRow(row: Row): Profile {
  const out: Profile = {}
  for (const f of PROFILE_FIELDS) {
    const v = row[f.col]
    if (v == null) out[f.key] = null
    else if (f.type === 'int') out[f.key] = Number(v)
    else if (f.type === 'bool') out[f.key] = v === true || v === 't' || v === 'true'
    else if (f.type === 'date') out[f.key] = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)
    else out[f.key] = String(v)
  }
  return out
}

export function hasProfileInput(input: Record<string, unknown>): boolean {
  return PROFILE_FIELDS.some((f) => input[f.key] !== undefined)
}
