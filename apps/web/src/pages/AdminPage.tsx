import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Role } from '@hdp/rules'
import { apiJson } from '../api'
import { useAuth } from '../auth'
import { AuditLogPanel } from '../components/AuditLogPanel'
import { CardTemplateAdmin } from '../components/CardTemplateAdmin'
import { PowerBiPanel } from '../components/PowerBiPanel'
import { Alert, Button, EmptyState, Field, PageHeader, Panel, RoleBadge, Segmented, SelectInput, StatusPill, TextInput } from '../components/ui'
import { explainError } from '../errors'
import { useI18n, type CopyKey } from '../i18n'

interface UserRow {
  id: string
  username: string
  displayName: string
  role: string
  active: boolean
  dpCodes: string[]
}

interface AssignedUser {
  id: string
  username: string
  displayName: string
  role: string
  active: boolean
}

interface DpRow {
  code: string
  nameEn: string
  nameAr: string
  district: string
  active: boolean
  latitude?: number | null
  longitude?: number | null
  gpsRadiusM?: number
  gpsCheckActive?: boolean
  householdCount?: number
  assignedUsers?: AssignedUser[]
}

interface DeviceRow {
  deviceId: string
  label: string
  lastSeenAt: string | null
}

interface EditForm {
  id: string
  username: string
  displayName: string
  role: string
  dpCodes: string
  password: string
  pin: string
  active: boolean
}

interface DpEdit {
  code: string
  nameEn: string
  nameAr: string
  district: string
  active: boolean
  latitude: string
  longitude: string
  gpsRadiusM: string
  gpsCheckActive: boolean
  supervisorId: string | null
  distributorIds: string[]
  otherIds: string[]
}

type Tab = 'access' | 'points' | 'cards' | 'audit' | 'devices' | 'powerbi'

const DP_CODE = /^[A-Z0-9]{2,8}$/
const USERNAME_OK = /^[a-z0-9._-]{3,32}$/

const ROLE_DESC: Record<string, CopyKey> = {
  dp_focal: 'roleDescFocal',
  meal: 'roleDescMeal',
  supervisor: 'roleDescSupervisor',
  admin: 'roleDescAdmin',
}

export function AdminPage() {
  const { session } = useAuth()
  const { t, locale } = useI18n()
  const [tab, setTab] = useState<Tab>('access')
  const [users, setUsers] = useState<UserRow[]>([])
  const [dps, setDps] = useState<DpRow[]>([])
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [message, setMessage] = useState('')
  const [tone, setTone] = useState<'ok' | 'danger'>('ok')
  const [roleFilter, setRoleFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ username: '', displayName: '', password: '', role: 'dp_focal', dpCodes: '', pin: '' })
  const [editing, setEditing] = useState<EditForm | null>(null)
  const [editingPoint, setEditingPoint] = useState<DpEdit | null>(null)
  const [point, setPoint] = useState({
    code: '',
    nameEn: '',
    nameAr: '',
    district: 'Al-Mudhaffar',
    active: true,
    latitude: '',
    longitude: '',
    gpsRadiusM: '150',
    gpsCheckActive: false,
  })
  const [showCreatePoint, setShowCreatePoint] = useState(false)
  const [pointQuery, setPointQuery] = useState('')
  const [districtFilter, setDistrictFilter] = useState('all')
  const [pointStatus, setPointStatus] = useState('all')

  function reload() {
    void apiJson<UserRow[]>('/api/admin/users').then(setUsers)
    void apiJson<DpRow[]>('/api/admin/dps').then(setDps)
    void apiJson<DeviceRow[]>('/api/admin/devices').then(setDevices)
  }

  useEffect(() => {
    reload()
  }, [])

  function flash(text: string, next: 'ok' | 'danger' = 'ok') {
    setMessage(text)
    setTone(next)
  }

  function notice(error: unknown) {
    flash(explainError(t, error), 'danger')
  }

  function roleLabel(role: string) {
    if (role === 'dp_focal') return t('roleDpFocal')
    if (role === 'meal') return t('roleMeal')
    if (role === 'supervisor') return t('roleSupervisor')
    return t('roleAdmin')
  }

  function roleOptions() {
    return (
      <>
        <option value="dp_focal">{t('roleDpFocal')}</option>
        <option value="meal">{t('roleMeal')}</option>
        <option value="supervisor">{t('roleSupervisor')}</option>
        <option value="admin">{t('roleAdmin')}</option>
      </>
    )
  }

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((user) => {
      if (roleFilter !== 'all' && user.role !== roleFilter) return false
      if (!q) return true
      return (
        user.username.toLowerCase().includes(q) ||
        user.displayName.toLowerCase().includes(q) ||
        user.dpCodes.join(' ').toLowerCase().includes(q)
      )
    })
  }, [users, roleFilter, query])

  const counts = useMemo(() => {
    const byRole: Record<string, number> = { admin: 0, supervisor: 0, meal: 0, dp_focal: 0 }
    let active = 0
    for (const user of users) {
      byRole[user.role] = (byRole[user.role] ?? 0) + 1
      if (user.active) active += 1
    }
    return { byRole, active, total: users.length }
  }, [users])

  const filteredDps = useMemo(() => {
    const q = pointQuery.trim().toLowerCase()
    return dps.filter((dp) => {
      if (districtFilter !== 'all' && dp.district !== districtFilter) return false
      if (pointStatus === 'active' && !dp.active) return false
      if (pointStatus === 'off' && dp.active) return false
      if (!q) return true
      return (
        dp.code.toLowerCase().includes(q) ||
        dp.nameEn.toLowerCase().includes(q) ||
        dp.nameAr.includes(pointQuery.trim()) ||
        dp.district.toLowerCase().includes(q)
      )
    })
  }, [dps, pointQuery, districtFilter, pointStatus])

  async function createUser(event: FormEvent) {
    event.preventDefault()
    const username = form.username.trim().toLowerCase()
    if (!USERNAME_OK.test(username)) {
      flash(t('usernameHint'), 'danger')
      return
    }
    if (form.password.length < 8) {
      flash(t('passwordHint'), 'danger')
      return
    }
    if (form.role === 'supervisor' && !/^\d{4,8}$/.test(form.pin.trim())) {
      flash(t('pinRequiredHint'), 'danger')
      return
    }
    try {
      await apiJson('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          username,
          displayName: form.displayName.trim(),
          password: form.password,
          role: form.role,
          dpCodes: form.dpCodes
            .split(',')
            .map((code) => code.trim().toUpperCase())
            .filter(Boolean),
          pin: form.pin.trim() || null,
        }),
      })
      flash(t('userCreated'))
      setForm({ username: '', displayName: '', password: '', role: 'dp_focal', dpCodes: '', pin: '' })
      setShowCreate(false)
      reload()
    } catch (error) {
      notice(error)
    }
  }

  function startEdit(user: UserRow) {
    setEditing({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      dpCodes: user.dpCodes.join(', '),
      password: '',
      pin: '',
      active: user.active,
    })
    setShowCreate(false)
    setMessage('')
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    if (editing.role === 'supervisor' && editing.pin && !/^\d{4,8}$/.test(editing.pin.trim())) {
      flash(t('pinRequiredHint'), 'danger')
      return
    }
    try {
      await apiJson(`/api/admin/users/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(editing.role === 'supervisor'
            ? {}
            : { username: editing.username.trim().toLowerCase(), displayName: editing.displayName }),
          role: editing.role,
          dpCodes: editing.dpCodes
            .split(',')
            .map((code) => code.trim().toUpperCase())
            .filter(Boolean),
          active: editing.active,
          ...(editing.password ? { password: editing.password } : {}),
          ...(editing.pin ? { pin: editing.pin.trim() } : {}),
        }),
      })
      setEditing(null)
      flash(t('userSaved'))
      reload()
    } catch (error) {
      notice(error)
    }
  }

  function districtLabel(district: string) {
    if (district === 'Al-Qahira') return t('districtQahira')
    return t('districtMudhaffar')
  }


  function parseGpsFields(fields: { latitude: string; longitude: string; gpsRadiusM: string; gpsCheckActive: boolean }) {
    const latRaw = fields.latitude.trim()
    const lngRaw = fields.longitude.trim()
    const latitude = latRaw === '' ? null : Number(latRaw)
    const longitude = lngRaw === '' ? null : Number(lngRaw)
    const gpsRadiusM = Number(fields.gpsRadiusM || '150')
    if ((latitude == null) !== (longitude == null)) {
      flash(t('invalid_location'), 'danger')
      return null
    }
    if (latitude != null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
      flash(t('invalid_location'), 'danger')
      return null
    }
    if (longitude != null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
      flash(t('invalid_location'), 'danger')
      return null
    }
    if (!Number.isFinite(gpsRadiusM) || gpsRadiusM < 10 || gpsRadiusM > 5000) {
      flash(t('invalid_gps_radius'), 'danger')
      return null
    }
    if (fields.gpsCheckActive && (latitude == null || longitude == null)) {
      flash(t('gps_point_required'), 'danger')
      return null
    }
    return { latitude, longitude, gpsRadiusM, gpsCheckActive: fields.gpsCheckActive }
  }

  function startPointEdit(dp: DpRow) {
    const staff = dp.assignedUsers ?? []
    const supervisors = staff.filter((user) => user.role === 'supervisor')
    const distributors = staff.filter((user) => user.role === 'dp_focal')
    const others = staff.filter((user) => user.role !== 'supervisor' && user.role !== 'dp_focal')
    setEditingPoint({
      code: dp.code,
      nameEn: dp.nameEn,
      nameAr: dp.nameAr,
      district: dp.district,
      active: dp.active,
      latitude: dp.latitude == null ? '' : String(dp.latitude),
      longitude: dp.longitude == null ? '' : String(dp.longitude),
      gpsRadiusM: String(dp.gpsRadiusM ?? 150),
      gpsCheckActive: Boolean(dp.gpsCheckActive),
      supervisorId: supervisors[0]?.id ?? null,
      distributorIds: distributors.map((user) => user.id),
      otherIds: others.map((user) => user.id),
    })
    setShowCreatePoint(false)
    setMessage('')
  }

  function setPointSupervisor(userId: string | null) {
    setEditingPoint((current) => (current ? { ...current, supervisorId: userId } : current))
  }

  function toggleDistributor(userId: string) {
    setEditingPoint((current) => {
      if (!current) return current
      const set = new Set(current.distributorIds)
      if (set.has(userId)) set.delete(userId)
      else set.add(userId)
      return { ...current, distributorIds: [...set] }
    })
  }

  function pointUserIds(edit: DpEdit) {
    return [...new Set([edit.supervisorId, ...edit.distributorIds, ...edit.otherIds].filter(Boolean) as string[])]
  }

  function staffLabel(user: { role: string; username: string; displayName: string }) {
    if (user.role === 'supervisor') return t('roleSupervisor')
    return user.displayName || user.username
  }

  async function createPoint(event: FormEvent) {
    event.preventDefault()
    const code = point.code.trim().toUpperCase()
    if (!DP_CODE.test(code)) {
      flash(t('invalid_dp_code'), 'danger')
      return
    }
    if (point.nameEn.trim().length < 2 || point.nameAr.trim().length < 2) {
      flash(t('invalid_body'), 'danger')
      return
    }
    const gps = parseGpsFields(point)
    if (!gps) return
    try {
      await apiJson('/api/admin/dps', {
        method: 'POST',
        body: JSON.stringify({
          code,
          nameEn: point.nameEn.trim(),
          nameAr: point.nameAr.trim(),
          district: point.district,
          active: point.active,
          ...gps,
        }),
      })
      flash(t('dpCreated'))
      setPoint({
        code: '',
        nameEn: '',
        nameAr: '',
        district: 'Al-Mudhaffar',
        active: true,
        latitude: '',
        longitude: '',
        gpsRadiusM: '150',
        gpsCheckActive: false,
      })
      setShowCreatePoint(false)
      reload()
    } catch (error) {
      notice(error)
    }
  }

  async function savePoint(event: FormEvent) {
    event.preventDefault()
    if (!editingPoint) return
    if (editingPoint.nameEn.trim().length < 2 || editingPoint.nameAr.trim().length < 2) {
      flash(t('invalid_body'), 'danger')
      return
    }
    const gps = parseGpsFields(editingPoint)
    if (!gps) return
    try {
      await apiJson(`/api/admin/dps/${editingPoint.code}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nameEn: editingPoint.nameEn.trim(),
          nameAr: editingPoint.nameAr.trim(),
          district: editingPoint.district,
          active: editingPoint.active,
          userIds: pointUserIds(editingPoint),
          ...gps,
        }),
      })
      setEditingPoint(null)
      flash(t('dpSaved'))
      reload()
    } catch (error) {
      notice(error)
    }
  }

  async function removeUser(user: UserRow) {
    const label = user.role === 'supervisor' ? t('roleSupervisor') : user.username
    if (!window.confirm(`${t('delete')} ${label}?`)) return
    try {
      await apiJson(`/api/admin/users/${user.id}`, { method: 'DELETE' })
      if (editing?.id === user.id) setEditing(null)
      flash(t('userDeleted'))
      reload()
    } catch (error) {
      notice(error)
    }
  }

  function toggleDpCode(current: string, code: string, setter: (next: string) => void) {
    const set = new Set(
      current
        .split(',')
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean),
    )
    if (set.has(code)) set.delete(code)
    else set.add(code)
    setter([...set].sort().join(', '))
  }

  function DpPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
    const selected = new Set(
      value
        .split(',')
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean),
    )
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {dps
          .filter((dp) => dp.active)
          .map((dp) => {
            const on = selected.has(dp.code)
            return (
              <button
                key={dp.code}
                type="button"
                onClick={() => toggleDpCode(value, dp.code, onChange)}
                className={`min-h-12 rounded-xl border px-3 text-start text-sm font-semibold transition ${
                  on ? 'border-teal bg-teal text-white' : 'border-line bg-white text-ink hover:bg-mist'
                }`}
              >
                <span className="block font-mono text-xs" dir="ltr">
                  {dp.code}
                </span>
                <span className="line-clamp-1 text-xs opacity-80">{locale === 'ar' ? dp.nameAr : dp.nameEn}</span>
              </button>
            )
          })}
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <PageHeader title={t('admin')} subtitle={t('adminSubtitle')} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Panel className="!p-3 sm:!p-4">
          <p className="tabular text-2xl font-bold text-teal">{counts.total}</p>
          <p className="text-xs font-semibold text-muted">{t('users')}</p>
        </Panel>
        <Panel className="!p-3 sm:!p-4">
          <p className="tabular text-2xl font-bold text-served">{counts.active}</p>
          <p className="text-xs font-semibold text-muted">{t('active')}</p>
        </Panel>
        <Panel className="!p-3 sm:!p-4">
          <p className="tabular text-2xl font-bold">{dps.filter((d) => d.active).length}</p>
          <p className="text-xs font-semibold text-muted">{t('points')}</p>
        </Panel>
        <Panel className="!p-3 sm:!p-4">
          <p className="tabular text-2xl font-bold">{devices.length}</p>
          <p className="text-xs font-semibold text-muted">{t('devices')}</p>
        </Panel>
      </div>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'access', label: t('accessControl') },
          { value: 'points', label: t('points') },
          { value: 'cards', label: t('cardTemplate') },
          { value: 'audit', label: t('auditLog') },
          { value: 'devices', label: t('devices') },
          { value: 'powerbi', label: 'Power BI' },
        ]}
      />

      {message ? <Alert tone={tone === 'ok' ? 'ok' : 'danger'}>{message}</Alert> : null}

      {tab === 'access' ? (
        <div className="grid gap-4">
          <Alert tone="info">{t('accessTeamHint')}</Alert>
          <Panel className="grid gap-3">
            <h2 className="text-lg font-bold">{t('whoCanWhat')}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {(['dp_focal', 'meal', 'supervisor', 'admin'] as Role[]).map((role) => (
                <div key={role} className="rounded-2xl border border-line bg-mist/50 p-3">
                  <div className="mb-1">
                    <RoleBadge role={role} label={roleLabel(role)} />
                  </div>
                  <p className="text-sm leading-snug text-muted">{t(ROLE_DESC[role])}</p>
                  <p className="mt-2 text-xs font-bold text-teal">
                    {counts.byRole[role] ?? 0} {t('accounts')}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">{t('users')}</h2>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setShowCreate((v) => !v)
                  setEditing(null)
                }}
              >
                {showCreate ? t('cancel') : t('createUser')}
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <TextInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('searchUsers')}
              />
              <SelectInput value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                <option value="all">{t('allRoles')}</option>
                {roleOptions()}
              </SelectInput>
            </div>

            {showCreate ? (
              <form className="grid gap-3 rounded-2xl border border-lagoon/30 bg-mist/40 p-4" onSubmit={(event) => void createUser(event)}>
                <h3 className="font-bold text-teal">{t('createUser')}</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label={t('username')} hint={t('usernameHint')}>
                    <TextInput
                      dir="ltr"
                      value={form.username}
                      onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase() })}
                    />
                  </Field>
                  <Field label={t('displayName')}>
                    <TextInput value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
                  </Field>
                  <Field label={t('newPassword')} hint={t('passwordHint')}>
                    <TextInput type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
                  </Field>
                  <Field label={t('role')} hint={t(ROLE_DESC[form.role] ?? 'roleDescFocal')}>
                    <SelectInput value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                      {roleOptions()}
                    </SelectInput>
                  </Field>
                </div>
                <Field label={t('assigned')} hint={t('assignedHint')}>
                  <DpPicker value={form.dpCodes} onChange={(dpCodes) => setForm({ ...form, dpCodes })} />
                </Field>
                {form.role === 'supervisor' ? (
                  <Field label={t('pin')} hint={t('pinRequiredHint')}>
                    <TextInput dir="ltr" value={form.pin} onChange={(event) => setForm({ ...form, pin: event.target.value })} />
                  </Field>
                ) : null}
                <Button type="submit">{t('create')}</Button>
              </form>
            ) : null}

            {editing ? (
              <form className="grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm" onSubmit={(event) => void saveEdit(event)}>
                <h3 className="font-bold">{t('edit')}</h3>
                {editing.role === 'supervisor' ? null : (
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label={t('username')}>
                      <TextInput dir="ltr" value={editing.username} onChange={(event) => setEditing({ ...editing, username: event.target.value })} />
                    </Field>
                    <Field label={t('displayName')}>
                      <TextInput value={editing.displayName} onChange={(event) => setEditing({ ...editing, displayName: event.target.value })} />
                    </Field>
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label={t('role')} hint={t(ROLE_DESC[editing.role] ?? 'roleDescFocal')}>
                    <SelectInput value={editing.role} onChange={(event) => setEditing({ ...editing, role: event.target.value })}>
                      {roleOptions()}
                    </SelectInput>
                  </Field>
                  <Field label={t('passwordKeep')}>
                    <TextInput type="password" value={editing.password} onChange={(event) => setEditing({ ...editing, password: event.target.value })} />
                  </Field>
                </div>
                <Field label={t('assigned')} hint={t('assignedHint')}>
                  <DpPicker value={editing.dpCodes} onChange={(dpCodes) => setEditing({ ...editing, dpCodes })} />
                </Field>
                {editing.role === 'supervisor' ? (
                  <Field label={t('pin')} hint={t('pinRequiredHint')}>
                    <TextInput dir="ltr" value={editing.pin} onChange={(event) => setEditing({ ...editing, pin: event.target.value })} />
                  </Field>
                ) : null}
                <label className="flex min-h-12 items-center gap-2 font-semibold">
                  <input type="checkbox" checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} />
                  {t('active')} — {t('deactivateHint')}
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit">{t('save')}</Button>
                  <Button type="button" tone="sand" onClick={() => setEditing(null)}>
                    {t('cancel')}
                  </Button>
                </div>
              </form>
            ) : null}

            {filteredUsers.length === 0 ? <EmptyState title={t('empty')} body={t('noUsersMatch')} /> : null}
            <ul className="grid gap-2">
              {filteredUsers.map((user) => (
                <li key={user.id} className="rounded-2xl border border-line bg-white p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold" dir="ltr">
                          {user.role === 'supervisor' ? t('roleSupervisor') : user.username}
                        </p>
                        <RoleBadge role={user.role} label={roleLabel(user.role)} />
                        <StatusPill on={user.active} onLabel={t('active')} offLabel={t('off')} />
                      </div>
                      {user.role === 'supervisor' ? null : <p className="mt-0.5 text-sm text-muted">{user.displayName}</p>}
                      <p className="mt-2 font-mono text-xs text-muted" dir="ltr">
                        {user.dpCodes.length > 0 ? user.dpCodes.join(' · ') : t('noPointsAssigned')}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button type="button" size="sm" tone="sand" onClick={() => startEdit(user)}>
                        {t('edit')}
                      </Button>
                      <Button type="button" size="sm" tone="blocked" disabled={user.id === session?.user.id} onClick={() => void removeUser(user)}>
                        {t('delete')}
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : null}

      {tab === 'points' ? (
        <div className="grid gap-4">
          <Panel className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">{t('points')}</h2>
                <p className="mt-1 text-sm text-muted">{t('pointsSubtitle')}</p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setShowCreatePoint((v) => !v)
                  setEditingPoint(null)
                }}
              >
                {showCreatePoint ? t('cancel') : t('createPoint')}
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <TextInput
                value={pointQuery}
                onChange={(event) => setPointQuery(event.target.value)}
                placeholder={t('searchPoints')}
              />
              <SelectInput value={districtFilter} onChange={(event) => setDistrictFilter(event.target.value)}>
                <option value="all">{t('allDistricts')}</option>
                <option value="Al-Mudhaffar">{t('districtMudhaffar')}</option>
                <option value="Al-Qahira">{t('districtQahira')}</option>
              </SelectInput>
              <SelectInput value={pointStatus} onChange={(event) => setPointStatus(event.target.value)}>
                <option value="all">{t('allStatuses')}</option>
                <option value="active">{t('active')}</option>
                <option value="off">{t('off')}</option>
              </SelectInput>
            </div>

            {showCreatePoint ? (
              <form id="create-dp" className="grid gap-3 rounded-2xl border border-lagoon/30 bg-mist/40 p-4" onSubmit={(event) => void createPoint(event)}>
                <h3 className="font-bold text-teal">{t('createPoint')}</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label={t('pointCode')} hint={t('invalid_dp_code')}>
                    <TextInput
                      id="create-dp-code"
                      dir="ltr"
                      value={point.code}
                      onChange={(event) => setPoint({ ...point, code: event.target.value.toUpperCase() })}
                    />
                  </Field>
                  <Field label={t('district')}>
                    <SelectInput id="create-dp-district" value={point.district} onChange={(event) => setPoint({ ...point, district: event.target.value })}>
                      <option value="Al-Mudhaffar">{t('districtMudhaffar')}</option>
                      <option value="Al-Qahira">{t('districtQahira')}</option>
                    </SelectInput>
                  </Field>
                  <Field label={t('nameEn')}>
                    <TextInput id="create-dp-name-en" value={point.nameEn} onChange={(event) => setPoint({ ...point, nameEn: event.target.value })} />
                  </Field>
                  <Field label={t('nameAr')}>
                    <TextInput id="create-dp-name-ar" value={point.nameAr} onChange={(event) => setPoint({ ...point, nameAr: event.target.value })} />
                  </Field>
                </div>
                <label className="flex min-h-12 items-center gap-2 font-semibold">
                  <input id="create-dp-active" type="checkbox" checked={point.active} onChange={(event) => setPoint({ ...point, active: event.target.checked })} />
                  {t('active')} — {t('pointActiveHint')}
                </label>
                <div className="grid gap-3 rounded-2xl border border-line bg-white/70 p-3">
                  <div>
                    <h4 className="font-bold text-teal">{t('gpsSection')}</h4>
                    <p className="mt-1 text-xs text-muted">{t('gpsCheckHint')}</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field label={t('latitude')}>
                      <TextInput
                        id="create-dp-lat"
                        dir="ltr"
                        inputMode="decimal"
                        value={point.latitude}
                        onChange={(event) => setPoint({ ...point, latitude: event.target.value })}
                        placeholder="13.57952"
                      />
                    </Field>
                    <Field label={t('longitude')}>
                      <TextInput
                        id="create-dp-lng"
                        dir="ltr"
                        inputMode="decimal"
                        value={point.longitude}
                        onChange={(event) => setPoint({ ...point, longitude: event.target.value })}
                        placeholder="44.02091"
                      />
                    </Field>
                    <Field label={t('gpsRadiusM')} hint={t('gpsRadiusHint')}>
                      <TextInput
                        id="create-dp-radius"
                        dir="ltr"
                        inputMode="numeric"
                        value={point.gpsRadiusM}
                        onChange={(event) => setPoint({ ...point, gpsRadiusM: event.target.value })}
                      />
                    </Field>
                  </div>
                  <label className="flex min-h-12 items-center gap-2 font-semibold">
                    <input
                      id="create-dp-gps-check"
                      type="checkbox"
                      checked={point.gpsCheckActive}
                      onChange={(event) => setPoint({ ...point, gpsCheckActive: event.target.checked })}
                    />
                    {t('gpsCheckActive')}
                  </label>
                </div>
                <Button type="submit">{t('create')}</Button>
              </form>
            ) : null}

            {editingPoint ? (
              <form id="edit-dp" className="grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm" onSubmit={(event) => void savePoint(event)}>
                <h3 className="font-bold">{t('editPoint')}</h3>
                <Field label={t('pointCode')} hint={t('codeFixed')}>
                  <TextInput id="edit-dp-code" dir="ltr" value={editingPoint.code} readOnly />
                </Field>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label={t('nameEn')}>
                    <TextInput
                      id="edit-dp-name-en"
                      value={editingPoint.nameEn}
                      onChange={(event) => setEditingPoint({ ...editingPoint, nameEn: event.target.value })}
                    />
                  </Field>
                  <Field label={t('nameAr')}>
                    <TextInput
                      id="edit-dp-name-ar"
                      value={editingPoint.nameAr}
                      onChange={(event) => setEditingPoint({ ...editingPoint, nameAr: event.target.value })}
                    />
                  </Field>
                  <Field label={t('district')}>
                    <SelectInput
                      id="edit-dp-district"
                      value={editingPoint.district}
                      onChange={(event) => setEditingPoint({ ...editingPoint, district: event.target.value })}
                    >
                      <option value="Al-Mudhaffar">{t('districtMudhaffar')}</option>
                      <option value="Al-Qahira">{t('districtQahira')}</option>
                    </SelectInput>
                  </Field>
                </div>
                <label className="flex min-h-12 items-center gap-2 font-semibold">
                  <input
                    id="edit-dp-active"
                    type="checkbox"
                    checked={editingPoint.active}
                    onChange={(event) => setEditingPoint({ ...editingPoint, active: event.target.checked })}
                  />
                  {t('active')} — {t('pointActiveHint')}
                </label>
                <div className="grid gap-3 rounded-2xl border border-line bg-mist/40 p-3">
                  <div>
                    <h4 className="font-bold text-teal">{t('gpsSection')}</h4>
                    <p className="mt-1 text-xs text-muted">{t('gpsCheckHint')}</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field label={t('latitude')}>
                      <TextInput
                        id="edit-dp-lat"
                        dir="ltr"
                        inputMode="decimal"
                        value={editingPoint.latitude}
                        onChange={(event) => setEditingPoint({ ...editingPoint, latitude: event.target.value })}
                      />
                    </Field>
                    <Field label={t('longitude')}>
                      <TextInput
                        id="edit-dp-lng"
                        dir="ltr"
                        inputMode="decimal"
                        value={editingPoint.longitude}
                        onChange={(event) => setEditingPoint({ ...editingPoint, longitude: event.target.value })}
                      />
                    </Field>
                    <Field label={t('gpsRadiusM')} hint={t('gpsRadiusHint')}>
                      <TextInput
                        id="edit-dp-radius"
                        dir="ltr"
                        inputMode="numeric"
                        value={editingPoint.gpsRadiusM}
                        onChange={(event) => setEditingPoint({ ...editingPoint, gpsRadiusM: event.target.value })}
                      />
                    </Field>
                  </div>
                  <label className="flex min-h-12 items-center gap-2 font-semibold">
                    <input
                      id="edit-dp-gps-check"
                      type="checkbox"
                      checked={editingPoint.gpsCheckActive}
                      onChange={(event) => setEditingPoint({ ...editingPoint, gpsCheckActive: event.target.checked })}
                    />
                    {t('gpsCheckActive')}
                  </label>
                </div>
                <div className="grid gap-4 rounded-2xl border border-line bg-mist/30 p-3">
                  <div>
                    <h4 className="font-bold text-teal">{t('pointTeam')}</h4>
                    <p className="mt-1 text-xs text-muted">{t('pointTeamHint')}</p>
                  </div>
                  <Field label={t('pointSupervisor')} hint={t('pointSupervisorHint')}>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setPointSupervisor(null)}
                        className={`min-h-12 rounded-xl border px-3 py-2 text-start text-sm font-semibold transition ${
                          editingPoint.supervisorId == null
                            ? 'border-teal bg-teal text-white'
                            : 'border-line bg-white text-ink hover:bg-mist'
                        }`}
                      >
                        {t('noSupervisorYet')}
                      </button>
                      {users
                        .filter((user) => user.role === 'supervisor')
                        .map((user) => {
                          const on = editingPoint.supervisorId === user.id
                          return (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => setPointSupervisor(user.id)}
                              className={`min-h-12 rounded-xl border px-3 py-2 text-start text-sm font-semibold transition ${
                                on ? 'border-teal bg-teal text-white' : 'border-line bg-white text-ink hover:bg-mist'
                              }`}
                            >
                              <span className="flex flex-wrap items-center gap-2">
                                <RoleBadge role={user.role} label={roleLabel(user.role)} />
                                <StatusPill on={user.active} onLabel={t('active')} offLabel={t('off')} />
                              </span>
                              <span className="mt-1 block truncate">{staffLabel(user)}</span>
                            </button>
                          )
                        })}
                    </div>
                  </Field>
                  <Field label={t('pointDistributors')} hint={t('pointDistributorsHint')}>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {users.filter((user) => user.role === 'dp_focal').length === 0 ? (
                        <p className="text-sm text-muted">{t('noDistributorsAvailable')}</p>
                      ) : null}
                      {users
                        .filter((user) => user.role === 'dp_focal')
                        .map((user) => {
                          const on = editingPoint.distributorIds.includes(user.id)
                          return (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => toggleDistributor(user.id)}
                              className={`min-h-12 rounded-xl border px-3 py-2 text-start text-sm font-semibold transition ${
                                on ? 'border-teal bg-teal text-white' : 'border-line bg-white text-ink hover:bg-mist'
                              }`}
                            >
                              <span className="flex flex-wrap items-center gap-2">
                                <RoleBadge role={user.role} label={roleLabel(user.role)} />
                                <StatusPill on={user.active} onLabel={t('active')} offLabel={t('off')} />
                              </span>
                              <span className="mt-1 block truncate">{staffLabel(user)}</span>
                              <span className="block font-mono text-xs opacity-80" dir="ltr">
                                {user.username}
                              </span>
                            </button>
                          )
                        })}
                    </div>
                  </Field>
                  {editingPoint.otherIds.length > 0 ? (
                    <p className="text-xs text-muted">{t('otherAccessKept')}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit">{t('save')}</Button>
                  <Button type="button" tone="sand" onClick={() => setEditingPoint(null)}>
                    {t('cancel')}
                  </Button>
                  <Button
                    type="button"
                    tone="sand"
                    onClick={() => {
                      const code = editingPoint.code
                      setEditingPoint(null)
                      setTab('access')
                      setQuery(code)
                    }}
                  >
                    {t('openInAccess')}
                  </Button>
                </div>
              </form>
            ) : null}

            {filteredDps.length === 0 ? <EmptyState title={t('empty')} body={t('noPointsMatch')} /> : null}
            <ul className="grid gap-3 lg:grid-cols-2">
              {filteredDps.map((dp) => {
                const staff = dp.assignedUsers ?? []
                return (
                  <li key={dp.code} data-code={dp.code} className="rounded-2xl border border-line bg-white p-3 sm:p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-base font-bold" dir="ltr">
                            {dp.code}
                          </span>
                          <StatusPill on={dp.active} onLabel={t('active')} offLabel={t('off')} />
                        </div>
                        <p className="mt-1 truncate font-semibold">
                          {locale === 'ar' ? dp.nameAr : dp.nameEn}
                        </p>
                        <p className="truncate text-sm text-muted">
                          {locale === 'ar' ? dp.nameEn : dp.nameAr} · {districtLabel(dp.district)}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-muted">
                          <span className="rounded-full bg-mist px-2.5 py-1">
                            {t('householdsShort')}: <span className="tabular text-ink">{dp.householdCount ?? 0}</span>
                          </span>
                          <span className="rounded-full bg-mist px-2.5 py-1">
                            {t('pointSupervisor')}:{' '}
                            <span className="text-ink">
                              {staff.find((user) => user.role === 'supervisor')
                                ? staffLabel(staff.find((user) => user.role === 'supervisor')!)
                                : t('noSupervisorYet')}
                            </span>
                          </span>
                          <span className="rounded-full bg-mist px-2.5 py-1">
                            {t('pointDistributors')}:{' '}
                            <span className="tabular text-ink">{staff.filter((user) => user.role === 'dp_focal').length}</span>
                          </span>
                          <span className={`rounded-full px-2.5 py-1 ${dp.gpsCheckActive ? 'bg-teal/15 text-teal' : 'bg-mist'}`}>
                            {dp.gpsCheckActive ? t('gpsOn') : t('gpsOff')}
                            {dp.latitude != null && dp.longitude != null
                              ? ` · ${Number(dp.gpsRadiusM ?? 150)} m`
                              : ` · ${t('gpsUnset')}`}
                          </span>
                        </div>
                        {dp.latitude != null && dp.longitude != null ? (
                          <p className="mt-1 font-mono text-xs text-muted" dir="ltr">
                            {Number(dp.latitude).toFixed(5)}, {Number(dp.longitude).toFixed(5)}
                          </p>
                        ) : null}
                        {staff.filter((user) => user.role === 'dp_focal').length > 0 ? (
                          <p className="mt-2 line-clamp-2 text-xs text-muted">
                            {t('pointDistributors')}:{' '}
                            {staff
                              .filter((user) => user.role === 'dp_focal')
                              .map((user) => staffLabel(user))
                              .join(' · ')}
                          </p>
                        ) : (
                          <p className="mt-2 text-xs text-muted">{t('noDistributorsAssigned')}</p>
                        )}
                      </div>
                      <Button type="button" size="sm" tone="sand" onClick={() => startPointEdit(dp)}>
                        {t('edit')}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Panel>
        </div>
      ) : null}

      {tab === 'cards' ? <CardTemplateAdmin /> : null}

      {tab === 'audit' ? <AuditLogPanel /> : null}

      {tab === 'powerbi' ? <PowerBiPanel /> : null}

      {tab === 'devices' ? (
        <Panel>
          <h2 className="text-lg font-bold">{t('devices')}</h2>
          <p className="mt-1 text-sm text-muted">{t('devicesHint')}</p>
          {devices.length === 0 ? <div className="mt-4"><EmptyState title={t('empty')} body={t('noDevicesYet')} /></div> : null}
          <ul className="mt-4 grid gap-2">
            {devices.map((device) => (
              <li key={device.deviceId} className="rounded-2xl border border-line bg-mist/40 px-4 py-3" dir="ltr">
                <p className="truncate font-semibold">{device.label.slice(0, 64)}</p>
                <p className="text-xs text-muted">
                  {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : t('neverSynced')}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  )
}
