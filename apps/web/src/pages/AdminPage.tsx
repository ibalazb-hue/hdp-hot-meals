import { useEffect, useState, type FormEvent } from 'react'
import { apiJson } from '../api'
import { useAuth } from '../auth'
import { Button, Field, Panel, SelectInput, TextInput } from '../components/ui'
import { explainError } from '../errors'
import { useI18n } from '../i18n'

interface UserRow {
  id: string
  username: string
  displayName: string
  role: string
  active: boolean
  dpCodes: string[]
}

interface DpRow {
  code: string
  nameEn: string
  nameAr: string
  district: string
  active: boolean
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
}

const DP_CODE = /^[A-Z0-9]{2,8}$/

export function AdminPage() {
  const { session } = useAuth()
  const { t } = useI18n()
  const [users, setUsers] = useState<UserRow[]>([])
  const [dps, setDps] = useState<DpRow[]>([])
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ username: '', displayName: '', password: '', role: 'dp_focal', dpCodes: 'MDF01', pin: '' })
  const [editing, setEditing] = useState<EditForm | null>(null)
  const [editingPoint, setEditingPoint] = useState<DpEdit | null>(null)
  const [point, setPoint] = useState({ code: '', nameEn: '', nameAr: '', district: 'Al-Mudhaffar', active: true })

  function reload() {
    void apiJson<UserRow[]>('/api/admin/users').then(setUsers)
    void apiJson<DpRow[]>('/api/admin/dps').then(setDps)
    void apiJson<DeviceRow[]>('/api/admin/devices').then(setDevices)
  }

  useEffect(() => {
    reload()
  }, [])

  async function createUser(event: FormEvent) {
    event.preventDefault()
    try {
      await apiJson('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          dpCodes: form.dpCodes.split(',').map((code) => code.trim().toUpperCase()).filter(Boolean),
          pin: form.pin || null,
        }),
      })
      setMessage(t('userCreated'))
      setForm({ username: '', displayName: '', password: '', role: 'dp_focal', dpCodes: 'MDF01', pin: '' })
      reload()
    } catch (error) {
      notice(error)
    }
  }

  function notice(error: unknown) {
    setMessage(explainError(t, error))
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
    setMessage('')
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    try {
      await apiJson(`/api/admin/users/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(editing.role === 'supervisor'
            ? {}
            : { username: editing.username.trim().toLowerCase(), displayName: editing.displayName }),
          role: editing.role,
          dpCodes: editing.dpCodes.split(',').map((code) => code.trim().toUpperCase()).filter(Boolean),
          active: editing.active,
          ...(editing.password ? { password: editing.password } : {}),
          ...(editing.pin ? { pin: editing.pin } : {}),
        }),
      })
      setEditing(null)
      setMessage(t('userSaved'))
      reload()
    } catch (error) {
      notice(error)
    }
  }

  function districtLabel(district: string) {
    if (district === 'Al-Qahira') return t('districtQahira')
    return t('districtMudhaffar')
  }

  function startPointEdit(dp: DpRow) {
    setEditingPoint({
      code: dp.code,
      nameEn: dp.nameEn,
      nameAr: dp.nameAr,
      district: dp.district,
      active: dp.active,
    })
    setMessage('')
  }

  async function createPoint(event: FormEvent) {
    event.preventDefault()
    const code = point.code.trim().toUpperCase()
    if (!DP_CODE.test(code)) {
      setMessage(t('invalid_dp_code'))
      return
    }
    if (point.nameEn.trim().length < 2 || point.nameAr.trim().length < 2) {
      setMessage(t('invalid_body'))
      return
    }
    try {
      await apiJson('/api/admin/dps', {
        method: 'POST',
        body: JSON.stringify({
          code,
          nameEn: point.nameEn.trim(),
          nameAr: point.nameAr.trim(),
          district: point.district,
          active: point.active,
        }),
      })
      setMessage(t('dpCreated'))
      setPoint({ code: '', nameEn: '', nameAr: '', district: 'Al-Mudhaffar', active: true })
      reload()
    } catch (error) {
      notice(error)
    }
  }

  async function savePoint(event: FormEvent) {
    event.preventDefault()
    if (!editingPoint) return
    if (editingPoint.nameEn.trim().length < 2 || editingPoint.nameAr.trim().length < 2) {
      setMessage(t('invalid_body'))
      return
    }
    try {
      await apiJson(`/api/admin/dps/${editingPoint.code}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nameEn: editingPoint.nameEn.trim(),
          nameAr: editingPoint.nameAr.trim(),
          district: editingPoint.district,
          active: editingPoint.active,
        }),
      })
      setEditingPoint(null)
      setMessage(t('dpSaved'))
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
      setMessage(t('userDeleted'))
      reload()
    } catch (error) {
      notice(error)
    }
  }

  return (
    <div className="grid gap-4">
      <Panel>
        <h2 className="text-xl font-bold">{t('users')}</h2>
        <ul className="mt-2 text-sm">
          {users.map((user) => (
            <li key={user.id} className="flex min-h-14 items-center justify-between gap-2 border-b border-line py-2">
              <span>
                <span className="block font-semibold" dir="ltr">
                  {user.role === 'supervisor' ? t('roleSupervisor') : user.username}
                </span>
                <span className="text-muted">
                  {user.role === 'supervisor' ? t('roleSupervisor') : user.displayName} · {user.role}
                  {user.dpCodes.length > 0 ? ` · ${user.dpCodes.join(', ')}` : ''}
                  {user.active ? '' : ` · ${t('off')}`}
                </span>
              </span>
              <span className="flex shrink-0 gap-2">
                <Button type="button" size="sm" tone="sand" onClick={() => startEdit(user)}>
                  {t('edit')}
                </Button>
                <Button type="button" size="sm" tone="blocked" disabled={user.id === session?.user.id} onClick={() => void removeUser(user)}>
                  {t('delete')}
                </Button>
              </span>
            </li>
          ))}
        </ul>
        {editing ? (
          <form className="mt-3 grid gap-2" onSubmit={(event) => void saveEdit(event)}>
            {editing.role === 'supervisor' ? null : (
              <>
                <Field label={t('username')}>
                  <TextInput dir="ltr" value={editing.username} onChange={(event) => setEditing({ ...editing, username: event.target.value })} />
                </Field>
                <Field label={t('displayName')}>
                  <TextInput value={editing.displayName} onChange={(event) => setEditing({ ...editing, displayName: event.target.value })} />
                </Field>
              </>
            )}
            <Field label={t('role')}>
              <SelectInput value={editing.role} onChange={(event) => setEditing({ ...editing, role: event.target.value })}>
                <option value="dp_focal">dp_focal</option>
                <option value="meal">meal</option>
                <option value="supervisor">supervisor</option>
                <option value="admin">admin</option>
              </SelectInput>
            </Field>
            <Field label={t('assigned')}>
              <TextInput dir="ltr" value={editing.dpCodes} onChange={(event) => setEditing({ ...editing, dpCodes: event.target.value })} />
            </Field>
            <Field label={t('passwordKeep')}>
              <TextInput type="password" value={editing.password} onChange={(event) => setEditing({ ...editing, password: event.target.value })} />
            </Field>
            <Field label={t('pin')}>
              <TextInput dir="ltr" value={editing.pin} onChange={(event) => setEditing({ ...editing, pin: event.target.value })} />
            </Field>
            <label className="flex min-h-12 items-center gap-2 font-semibold">
              <input type="checkbox" checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} />
              {t('active')}
            </label>
            <div className="flex gap-2">
              <Button type="submit">{t('save')}</Button>
              <Button type="button" tone="sand" onClick={() => setEditing(null)}>
                {t('cancel')}
              </Button>
            </div>
          </form>
        ) : null}
        <form className="mt-3 grid gap-2" onSubmit={createUser}>
          <TextInput placeholder={t('username')} value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
          <TextInput placeholder={t('displayName')} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
          <TextInput placeholder={t('newPassword')} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          <SelectInput value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
            <option value="dp_focal">dp_focal</option>
            <option value="meal">meal</option>
            <option value="supervisor">supervisor</option>
            <option value="admin">admin</option>
          </SelectInput>
          <TextInput placeholder="MDF01, MDF02" dir="ltr" value={form.dpCodes} onChange={(event) => setForm({ ...form, dpCodes: event.target.value })} />
          <TextInput placeholder={t('pin')} dir="ltr" value={form.pin} onChange={(event) => setForm({ ...form, pin: event.target.value })} />
          <Button type="submit">{t('create')}</Button>
        </form>
      </Panel>
      <Panel>
        <h2 className="text-xl font-bold">{t('points')}</h2>
        <ul className="mt-2 text-sm">
          {dps.map((dp) => (
            <li key={dp.code} data-code={dp.code} className="flex min-h-14 items-center justify-between gap-2 border-b border-line py-2">
              <span>
                <span className="block font-semibold" dir="ltr">
                  {dp.code}
                </span>
                <span className="text-muted">
                  {dp.nameEn} · {dp.nameAr} · {districtLabel(dp.district)} · {dp.active ? t('active') : t('off')}
                </span>
              </span>
              <Button type="button" size="sm" tone="sand" onClick={() => startPointEdit(dp)}>
                {t('edit')}
              </Button>
            </li>
          ))}
        </ul>
        {editingPoint ? (
          <form id="edit-dp" className="mt-3 grid gap-2" onSubmit={(event) => void savePoint(event)}>
            <Field label={t('pointCode')}>
              <TextInput id="edit-dp-code" dir="ltr" value={editingPoint.code} readOnly />
            </Field>
            <p className="text-sm text-muted">{t('codeFixed')}</p>
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
            <label className="flex min-h-12 items-center gap-2 font-semibold">
              <input
                id="edit-dp-active"
                type="checkbox"
                checked={editingPoint.active}
                onChange={(event) => setEditingPoint({ ...editingPoint, active: event.target.checked })}
              />
              {t('active')}
            </label>
            <div className="flex gap-2">
              <Button type="submit">{t('save')}</Button>
              <Button type="button" tone="sand" onClick={() => setEditingPoint(null)}>
                {t('cancel')}
              </Button>
            </div>
          </form>
        ) : null}
        <form id="create-dp" className="mt-3 grid gap-2" onSubmit={(event) => void createPoint(event)}>
          <Field label={t('pointCode')}>
            <TextInput
              id="create-dp-code"
              dir="ltr"
              value={point.code}
              onChange={(event) => setPoint({ ...point, code: event.target.value.toUpperCase() })}
            />
          </Field>
          <Field label={t('nameEn')}>
            <TextInput id="create-dp-name-en" value={point.nameEn} onChange={(event) => setPoint({ ...point, nameEn: event.target.value })} />
          </Field>
          <Field label={t('nameAr')}>
            <TextInput id="create-dp-name-ar" value={point.nameAr} onChange={(event) => setPoint({ ...point, nameAr: event.target.value })} />
          </Field>
          <Field label={t('district')}>
            <SelectInput id="create-dp-district" value={point.district} onChange={(event) => setPoint({ ...point, district: event.target.value })}>
              <option value="Al-Mudhaffar">{t('districtMudhaffar')}</option>
              <option value="Al-Qahira">{t('districtQahira')}</option>
            </SelectInput>
          </Field>
          <label className="flex min-h-12 items-center gap-2 font-semibold">
            <input id="create-dp-active" type="checkbox" checked={point.active} onChange={(event) => setPoint({ ...point, active: event.target.checked })} />
            {t('active')}
          </label>
          <Button type="submit">{t('create')}</Button>
        </form>
      </Panel>
      <Panel>
        <h2 className="text-xl font-bold">{t('devices')}</h2>
        {devices.length === 0 ? <p>{t('empty')}</p> : null}
        <ul className="mt-2 text-sm" dir="ltr">
          {devices.map((device) => (
            <li key={device.deviceId}>
              {device.label.slice(0, 48)} · {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : ''}
            </li>
          ))}
        </ul>
      </Panel>
      {message ? <p>{message}</p> : null}
    </div>
  )
}
