import { Field, SelectInput, TextInput } from './ui'
import { useI18n } from '../i18n'

export type HouseholdProfile = {
  headName?: string | null
  spouseName?: string | null
  headGender?: 'male' | 'female' | null
  headAge?: number | null
  idNumber?: string | null
  phone?: string | null
  males?: number | null
  females?: number | null
  hasPlw?: boolean | null
  hasDisability?: boolean | null
  hasElderly?: boolean | null
  displacementStatus?: 'idp' | 'host' | 'returnee' | null
  femaleHeaded?: boolean | null
  noCookingMeans?: boolean | null
  specialArrangements?: boolean | null
  eligibilityCardStatus?: 'disability' | 'elderly' | 'none' | null
  locationName?: string | null
  remarks?: string | null
  registrationDate?: string | null
}

export const PROFILE_KEYS: Array<keyof HouseholdProfile> = [
  'headName', 'spouseName', 'headGender', 'headAge', 'idNumber', 'phone', 'males', 'females', 'hasPlw', 'hasDisability',
  'hasElderly', 'displacementStatus', 'femaleHeaded', 'noCookingMeans', 'specialArrangements', 'eligibilityCardStatus',
  'locationName', 'remarks', 'registrationDate',
]

export function pickProfile(source: Record<string, unknown> | null | undefined): HouseholdProfile {
  const out: Record<string, unknown> = {}
  for (const key of PROFILE_KEYS) out[key] = source?.[key] ?? null
  return out as HouseholdProfile
}

/** Labels: [Arabic, English] */
export const PROFILE_LABELS: Record<keyof HouseholdProfile, [string, string]> = {
  headName: ['اسم رب/ربة الأسرة', 'Head of household'],
  spouseName: ['اسم الزوج / الزوجة', 'Name of spouse'],
  headGender: ['جنس رب/ربة الأسرة', 'HH gender'],
  headAge: ['عمر رب/ربة الأسرة', 'HH age'],
  idNumber: ['رقم البطاقة', 'ID number'],
  phone: ['رقم الهاتف', 'Phone number'],
  males: ['عدد الذكور', 'Males'],
  females: ['عدد الإناث', 'Females'],
  hasPlw: ['يوجد حوامل أو مرضعات', 'PLW in household'],
  hasDisability: ['يوجد فرد ذو إعاقة في الأسرة', 'Disability in household'],
  hasElderly: ['يوجد مسن في الأسرة', 'Elderly in household'],
  displacementStatus: ['حالة النزوح', 'Displacement status'],
  femaleHeaded: ['أسرة تعولها امرأة', 'Female-headed'],
  noCookingMeans: ['لا تمتلك وسائل طهي', 'No cooking means'],
  specialArrangements: ['تحتاج ترتيبات خاصة (كالتوصيل للمنزل)', 'Special arrangements'],
  eligibilityCardStatus: ['حالة بطاقة الأهلية', 'Eligibility card status'],
  locationName: ['اسم الموقع / المكان / المخيم', 'Village / location name'],
  remarks: ['ملاحظات', 'Remarks'],
  registrationDate: ['تاريخ التسجيل', 'Registration date'],
}

export const CHOICES: Record<string, Array<[string, string, string]>> = {
  headGender: [['male', 'ذكر', 'Male'], ['female', 'أنثى', 'Female']],
  displacementStatus: [['idp', 'نازح', 'IDP'], ['host', 'مقيم', 'Host'], ['returnee', 'عائد', 'Returnee']],
  eligibilityCardStatus: [['disability', 'إعاقة', 'Disability'], ['elderly', 'مسن', 'Elderly'], ['none', 'لا يوجد', 'None']],
}

const BOOLS: Array<keyof HouseholdProfile> = ['hasPlw', 'hasDisability', 'hasElderly', 'femaleHeaded', 'noCookingMeans', 'specialArrangements']
const TEXTS: Array<keyof HouseholdProfile> = ['headName', 'spouseName', 'idNumber', 'phone', 'locationName']

export function profileValueLabel(key: keyof HouseholdProfile, value: unknown, ar: boolean): string {
  if (value == null || value === '') return ''
  if (typeof value === 'boolean') return value ? (ar ? 'نعم' : 'Yes') : ar ? 'لا' : 'No'
  const choice = CHOICES[key]?.find((c) => c[0] === value)
  if (choice) return ar ? choice[1] : choice[2]
  return String(value)
}

export function HouseholdProfileForm({
  value,
  onChange,
}: {
  value: HouseholdProfile
  onChange: (next: HouseholdProfile) => void
}) {
  const { locale } = useI18n()
  const ar = locale === 'ar'
  const label = (key: keyof HouseholdProfile) => (ar ? PROFILE_LABELS[key][0] : `${PROFILE_LABELS[key][1]} / ${PROFILE_LABELS[key][0]}`)
  const set = (key: keyof HouseholdProfile, v: unknown) => onChange({ ...value, [key]: v })
  const num = (s: string) => (s.replace(/[^\d]/g, '') === '' ? null : Number(s.replace(/[^\d]/g, '').slice(0, 3)))
  const total = (value.males ?? 0) + (value.females ?? 0)
  const choice = (key: keyof HouseholdProfile) => (
    <Field key={key} label={label(key)}>
      <SelectInput data-testid={`hp-${key}`} value={(value[key] as string) ?? ''} onChange={(e) => set(key, e.target.value || null)}>
        <option value="">—</option>
        {CHOICES[key].map((c) => (
          <option key={c[0]} value={c[0]}>{ar ? c[1] : `${c[2]} / ${c[1]}`}</option>
        ))}
      </SelectInput>
    </Field>
  )
  return (
    <fieldset className="grid gap-3 rounded-2xl border border-line p-3">
      <legend className="px-1 text-sm font-bold text-teal">{ar ? 'بيانات التسجيل المسبق' : 'Pre-registration details'}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {TEXTS.slice(0, 2).map((key) => (
          <Field key={key} label={label(key)}>
            <TextInput data-testid={`hp-${key}`} value={(value[key] as string) ?? ''} maxLength={80} onChange={(e) => set(key, e.target.value)} />
          </Field>
        ))}
        {choice('headGender')}
        <Field label={label('headAge')}>
          <TextInput data-testid="hp-headAge" dir="ltr" inputMode="numeric" value={value.headAge ?? ''} onChange={(e) => set('headAge', num(e.target.value))} />
        </Field>
        {TEXTS.slice(2).map((key) => (
          <Field key={key} label={label(key)}>
            <TextInput data-testid={`hp-${key}`} dir={key === 'locationName' ? undefined : 'ltr'} value={(value[key] as string) ?? ''} maxLength={key === 'locationName' ? 120 : 40} onChange={(e) => set(key, e.target.value)} />
          </Field>
        ))}
        <Field label={label('males')}>
          <TextInput data-testid="hp-males" dir="ltr" inputMode="numeric" value={value.males ?? ''} onChange={(e) => set('males', num(e.target.value))} />
        </Field>
        <Field label={label('females')}>
          <TextInput data-testid="hp-females" dir="ltr" inputMode="numeric" value={value.females ?? ''} onChange={(e) => set('females', num(e.target.value))} />
        </Field>
      </div>
      <p className="text-sm font-semibold" data-testid="hp-total">
        {ar ? 'الإجمالي' : 'Total'}: {value.males != null || value.females != null ? total : '—'}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {BOOLS.map((key) => (
          <Field key={key} label={label(key)}>
            <SelectInput data-testid={`hp-${key}`} value={value[key] == null ? '' : value[key] ? 'yes' : 'no'} onChange={(e) => set(key, e.target.value === '' ? null : e.target.value === 'yes')}>
              <option value="">—</option>
              <option value="yes">{ar ? 'نعم' : 'Yes / نعم'}</option>
              <option value="no">{ar ? 'لا' : 'No / لا'}</option>
            </SelectInput>
          </Field>
        ))}
        {choice('displacementStatus')}
        {choice('eligibilityCardStatus')}
        <Field label={label('registrationDate')}>
          <TextInput data-testid="hp-registrationDate" type="date" dir="ltr" value={value.registrationDate ?? ''} onChange={(e) => set('registrationDate', e.target.value || null)} />
        </Field>
      </div>
      <Field label={label('remarks')}>
        <TextInput data-testid="hp-remarks" value={value.remarks ?? ''} maxLength={300} onChange={(e) => set('remarks', e.target.value)} />
      </Field>
    </fieldset>
  )
}

/** Payload for the API: empty strings → null. */
export function profilePayload(p: HouseholdProfile): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of PROFILE_KEYS) {
    const v = p[key]
    out[key] = typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v ?? null
  }
  return out
}
