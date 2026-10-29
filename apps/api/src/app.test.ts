import { adenDate, TRAINING_PASSWORD, TRAINING_PIN } from '@hdp/rules'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { createDatabase, migrate, type Database } from './db.js'
import { seed } from './seed.js'

let db: Database
let app: ReturnType<typeof createApp>

beforeEach(async () => {
  db = await createDatabase({ memory: true })
  await migrate(db)
  await seed(db)
  app = createApp(db)
})

afterEach(async () => {
  await db.close()
})

async function login(username: string) {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: TRAINING_PASSWORD }),
  })
  expect(response.status).toBe(200)
  return (await response.json()) as { token: string; user: { id: string; role: string; dpCodes: string[] } }
}

function auth(token: string) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

function scan(
  operatorId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: crypto.randomUUID(),
    cardCode: 'CMDF01000101',
    dpCode: 'MDF01',
    scannedAt: new Date().toISOString(),
    mode: 'card',
    clientResult: 'Served',
    offlineFlag: false,
    deviceId: 'tablet-test-1',
    operatorId,
    ...overrides,
  }
}

async function postScan(token: string, body: Record<string, unknown>) {
  const response = await app.request('/api/scans', { method: 'POST', headers: auth(token), body: JSON.stringify(body) })
  const json = (await response.json()) as { error?: string; scan?: { result: string; blockReason: string | null; countsAsDistributed: boolean; id: string }; demotedScanId?: string | null }
  return { status: response.status, json }
}

describe('meal scans', () => {
  it('stores the tablet location on the scan and still serves the meal', async () => {
    const focal = await login('focal.mudhaffar')
    const result = await postScan(
      focal.token,
      scan(focal.user.id, { cardCode: 'CMDF01000102', latitude: 13.57952, longitude: 44.02091, locationAccuracyM: 18 }),
    )
    expect(result.json.scan?.result).toBe('Served')
    const stored = result.json.scan as { latitude?: number; longitude?: number; locationAccuracyM?: number }
    expect(stored.latitude).toBeCloseTo(13.57952)
    expect(stored.longitude).toBeCloseTo(44.02091)
    expect(stored.locationAccuracyM).toBe(18)
  })

  it('serves once per household per Aden day and blocks the second scan', async () => {
    const focal = await login('focal.mudhaffar')
    const first = await postScan(focal.token, scan(focal.user.id))
    expect(first.status).toBe(200)
    expect(first.json.scan?.result).toBe('Served')

    const second = await postScan(
      focal.token,
      scan(focal.user.id, { scannedAt: new Date(Date.now() + 5_000).toISOString(), deviceId: 'tablet-test-2' }),
    )
    expect(second.json.scan?.blockReason).toBe('already_served')
    expect(second.json.scan?.countsAsDistributed).toBe(false)

    const date = adenDate()
    const dashboard = await app.request(`/api/dashboard?date=${date}&dp=MDF01`, { headers: auth(focal.token) })
    const counts = (await dashboard.json()) as { uniqueServed: number }
    expect(counts.uniqueServed).toBe(1)
  })

  it('never serves a voided card, including when a supervisor PIN is offered', async () => {
    const focal = await login('focal.mudhaffar')
    const result = await postScan(
      focal.token,
      scan(focal.user.id, {
        cardCode: 'CMDF01000103',
        overrideReason: 'They are here',
        supervisorPin: TRAINING_PIN,
      }),
    )
    expect(result.json.scan?.blockReason).toBe('voided')
    expect(result.json.scan?.countsAsDistributed).toBe(false)
  })

  it('blocks the wrong distribution point and allows a supervisor override', async () => {
    const focal = await login('focal.mudhaffar')
    const blocked = await postScan(focal.token, scan(focal.user.id, { cardCode: 'CQAH01000201' }))
    expect(blocked.json.scan?.blockReason).toBe('wrong_dp')

    const override = await postScan(
      focal.token,
      scan(focal.user.id, {
        cardCode: 'CQAH01000201',
        clientResult: 'Override',
        overrideReason: 'Kitchen at Qahira closed',
        supervisorPin: TRAINING_PIN,
      }),
    )
    expect(override.json.scan?.result).toBe('Override')
    expect(override.json.scan?.countsAsDistributed).toBe(true)
  })

  it('keeps the earlier offline Served when the later scan syncs first', async () => {
    const focal = await login('focal.mudhaffar')
    // Keep both device times on the same Asia/Aden calendar day (relative offsets fail near midnight).
    const today = adenDate()
    const dayStart = new Date(`${today}T00:00:00+03:00`).getTime()
    const dayEnd = new Date(`${today}T23:59:50+03:00`).getTime()
    const now = Date.now()
    let laterMs = Math.min(now - 5 * 60_000, dayEnd)
    let earlierMs = laterMs - 30 * 60_000
    if (earlierMs < dayStart) {
      earlierMs = dayStart + 60_000
      laterMs = earlierMs + 10 * 60_000
    }
    const later = scan(focal.user.id, {
      scannedAt: new Date(laterMs).toISOString(),
      deviceId: 'tablet-a',
      offlineFlag: true,
    })
    const earlier = scan(focal.user.id, {
      scannedAt: new Date(earlierMs).toISOString(),
      deviceId: 'tablet-b',
      offlineFlag: true,
    })
    const first = await postScan(focal.token, later)
    expect(first.json.scan?.result).toBe('Served')
    const second = await postScan(focal.token, earlier)
    expect(second.json.scan?.result).toBe('Served')
    expect(second.json.demotedScanId).toBe(later.id)

    const demoted = await app.request(`/api/scans/${later.id}`, { headers: auth(focal.token) })
    const demotedBody = (await demoted.json()) as { result: string; blockReason: string; countsAsDistributed: boolean }
    expect(demotedBody.result).toBe('Blocked')
    expect(demotedBody.blockReason).toBe('duplicate_conflict')
    expect(demotedBody.countsAsDistributed).toBe(false)

    const date = adenDate(earlier.scannedAt as string)
    const dashboard = await app.request(`/api/dashboard?date=${date}&dp=MDF01`, { headers: auth(focal.token) })
    expect(((await dashboard.json()) as { uniqueServed: number }).uniqueServed).toBe(1)
  })

  it('voids the old card on reissue and serves only the new card', async () => {
    const meal = await login('meal.taiz')
    const focal = await login('focal.mudhaffar')
    const reissue = await app.request('/api/households/TZ-MDF01-000102/reissue', {
      method: 'POST',
      headers: auth(meal.token),
      body: JSON.stringify({ reason: 'Lost card at the gate' }),
    })
    expect(reissue.status).toBe(200)
    const issued = (await reissue.json()) as { cardCode: string; previousCardCode: string; hhCode: string }
    expect(issued.previousCardCode).toBe('CMDF01000102')
    expect(issued.hhCode).toBe('TZ-MDF01-000102')

    const oldCard = await postScan(focal.token, scan(focal.user.id, { cardCode: 'CMDF01000102' }))
    expect(oldCard.json.scan?.blockReason).toBe('voided')

    const newCard = await postScan(focal.token, scan(focal.user.id, { cardCode: issued.cardCode }))
    expect(newCard.json.scan?.result).toBe('Served')
    const repeat = await postScan(focal.token, scan(focal.user.id, { cardCode: issued.cardCode }))
    expect(repeat.json.scan?.blockReason).toBe('already_served')
  })

  it('records a manual household code with the supervisor PIN', async () => {
    const focal = await login('focal.mudhaffar')
    const result = await postScan(
      focal.token,
      scan(focal.user.id, {
        mode: 'manual',
        cardCode: null,
        hhCode: 'TZ-MDF01-000101',
        clientResult: 'ManualException',
        overrideReason: 'Camera lens cracked',
        supervisorPin: TRAINING_PIN,
      }),
    )
    expect(result.json.scan?.result).toBe('ManualException')
    expect(result.json.scan?.countsAsDistributed).toBe(true)
  })

  it('exports a WFP register without biometrics and alerts reconciliation over 1%', async () => {
    const focal = await login('focal.mudhaffar')
    const meal = await login('meal.taiz')
    await postScan(focal.token, scan(focal.user.id, { offlineFlag: true }))
    const date = adenDate()
    const csvResponse = await app.request(`/api/export/register.csv?date=${date}&dp=MDF01`, { headers: auth(meal.token) })
    const csv = await csvResponse.text()
    expect(csv).toContain('hh_code')
    expect(csv).toContain('TZ-MDF01-000101')
    expect(csv.toLowerCase()).not.toContain('fingerprint')
    expect(csv).not.toContain('biometric')
    expect(csv).not.toContain('supervisor_id')
    expect(csv).not.toContain('supervisor.taiz')

    const tight = await app.request('/api/production', {
      method: 'POST',
      headers: auth(meal.token),
      body: JSON.stringify({ dpCode: 'MDF01', productionDate: date, mealsPrepared: 1 }),
    })
    expect(tight.status).toBe(200)
    const ok = await app.request(`/api/reconciliation?date=${date}`, { headers: auth(meal.token) })
    const okBody = (await ok.json()) as { rows: Array<{ dpCode: string; alert: boolean; uniqueServed: number }> }
    expect(okBody.rows.find((row) => row.dpCode === 'MDF01')).toMatchObject({ uniqueServed: 1, alert: false })

    await app.request('/api/production', {
      method: 'POST',
      headers: auth(meal.token),
      body: JSON.stringify({ dpCode: 'MDF01', productionDate: date, mealsPrepared: 100 }),
    })
    const wide = await app.request(`/api/reconciliation?date=${date}`, { headers: auth(meal.token) })
    const wideBody = (await wide.json()) as { rows: Array<{ dpCode: string; alert: boolean; reason: string }> }
    expect(wideBody.rows.find((row) => row.dpCode === 'MDF01')?.alert).toBe(true)
  })
})

describe('meals prepared access', () => {
  it('lets only MEAL enter or adjust meals prepared and keeps history', async () => {
    const meal = await login('meal.taiz')
    const admin = await login('admin.taiz')
    const supervisor = await login('supervisor.taiz')
    const date = adenDate()

    for (const actor of [admin, supervisor]) {
      const refused = await app.request('/api/production', {
        method: 'POST',
        headers: auth(actor.token),
        body: JSON.stringify({ dpCode: 'MDF01', productionDate: date, mealsPrepared: 50 }),
      })
      expect(refused.status).toBe(403)
    }

    const first = await app.request('/api/production', {
      method: 'POST',
      headers: auth(meal.token),
      body: JSON.stringify({ dpCode: 'MDF01', productionDate: date, mealsPrepared: 40 }),
    })
    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({ mealsPrepared: 40, previousMealsPrepared: null })

    const second = await app.request('/api/production', {
      method: 'POST',
      headers: auth(meal.token),
      body: JSON.stringify({ dpCode: 'MDF01', productionDate: date, mealsPrepared: 55 }),
    })
    expect(second.status).toBe(200)
    expect(await second.json()).toMatchObject({ mealsPrepared: 55, previousMealsPrepared: 40 })

    const recon = await app.request(`/api/reconciliation?date=${date}`, { headers: auth(admin.token) })
    expect(recon.status).toBe(200)
    const body = (await recon.json()) as {
      rows: Array<{
        dpCode: string
        mealsPrepared: number | null
        canEditPrepared: boolean
        history: Array<{ mealsPrepared: number; previousMealsPrepared: number | null }>
      }>
    }
    const row = body.rows.find((item) => item.dpCode === 'MDF01')
    expect(row?.mealsPrepared).toBe(55)
    expect(row?.canEditPrepared).toBe(false)
    expect(row?.history[0]).toMatchObject({ mealsPrepared: 55, previousMealsPrepared: 40 })
    expect(row?.history[1]).toMatchObject({ mealsPrepared: 40, previousMealsPrepared: null })

    const mealRecon = await app.request(`/api/reconciliation?date=${date}`, { headers: auth(meal.token) })
    const mealBody = (await mealRecon.json()) as { rows: Array<{ dpCode: string; canEditPrepared: boolean }> }
    expect(mealBody.rows.find((item) => item.dpCode === 'MDF01')?.canEditPrepared).toBe(true)
  })
})

describe('admin users', () => {
  it('lets an admin edit a user and delete one who has no audit record', async () => {
    const admin = await login('admin.taiz')
    const created = await app.request('/api/admin/users', {
      method: 'POST',
      headers: auth(admin.token),
      body: JSON.stringify({
        username: 'focal.new',
        displayName: 'New focal',
        password: 'Train-Hdp-2026',
        role: 'dp_focal',
        dpCodes: ['MDF01'],
      }),
    })
    expect(created.status).toBe(201)
    const { id } = (await created.json()) as { id: string }

    const edited = await app.request(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: auth(admin.token),
      body: JSON.stringify({ displayName: 'Renamed focal', dpCodes: ['MDF02'] }),
    })
    expect(edited.status).toBe(200)

    const list = await app.request('/api/admin/users', { headers: auth(admin.token) })
    const users = (await list.json()) as Array<{ id: string; displayName: string; dpCodes: string[] }>
    expect(users.find((user) => user.id === id)).toMatchObject({ displayName: 'Renamed focal', dpCodes: ['MDF02'] })

    const removed = await app.request(`/api/admin/users/${id}`, { method: 'DELETE', headers: auth(admin.token) })
    expect(removed.status).toBe(200)

    const self = await app.request(`/api/admin/users/${admin.user.id}`, { method: 'DELETE', headers: auth(admin.token) })
    expect(self.status).toBe(400)

    const meal = await login('meal.taiz')
    const kept = await app.request(`/api/admin/users/${meal.user.id}`, { method: 'DELETE', headers: auth(admin.token) })
    expect(kept.status).toBe(409)
  })

  it('gives the supervisor code and name only to the focal point', async () => {
    const admin = await login('admin.taiz')
    const list = await app.request('/api/admin/users', { headers: auth(admin.token) })
    const users = (await list.json()) as Array<{ username: string; displayName: string; role: string }>
    const supervisor = users.find((user) => user.role === 'supervisor')
    expect(supervisor).toMatchObject({ username: '', displayName: '' })
    expect(JSON.stringify(users)).not.toContain('supervisor.taiz')
    expect(JSON.stringify(users)).not.toContain('Taiz supervisor')

    for (const username of ['meal.taiz', 'supervisor.taiz', 'admin.taiz']) {
      const actor = await login(username)
      const bundle = await app.request('/api/sync/bundle', { headers: auth(actor.token) })
      const body = (await bundle.json()) as { supervisorPins: unknown[] }
      expect(body.supervisorPins).toEqual([])
    }

    const focal = await login('focal.mudhaffar')
    const focalBundle = await app.request('/api/sync/bundle', { headers: auth(focal.token) })
    const focalBody = (await focalBundle.json()) as {
      supervisorPins: Array<{ username: string; displayName: string; pinHash: string }>
    }
    expect(focalBody.supervisorPins[0]?.username).toBe('supervisor.taiz')
    expect(focalBody.supervisorPins[0]?.displayName).toBe('Taiz supervisor')
    expect(focalBody.supervisorPins[0]?.pinHash).toBeTruthy()
  })
})

describe('home served today API', () => {
  it('lets meal and admin see uniqueServed from all their accessible DPs after a focal serves', async () => {
    const focal = await login('focal.mudhaffar')
    const meal = await login('meal.taiz')
    const admin = await login('admin.taiz')
    const date = adenDate()

    await postScan(focal.token, scan(focal.user.id, { cardCode: 'CMDF01000101' }))

    for (const actor of [meal, admin]) {
      const dashboard = await app.request(`/api/dashboard?date=${date}`, { headers: auth(actor.token) })
      expect(dashboard.status).toBe(200)
      const body = (await dashboard.json()) as { uniqueServed: number }
      expect(body.uniqueServed).toBeGreaterThanOrEqual(1)
    }

    // Admin with no user_dps rows still receives servedToday in the sync bundle.
    await db.query(`DELETE FROM user_dps WHERE user_id = $1`, [admin.user.id])
    const bundle = await app.request('/api/sync/bundle', { headers: auth(admin.token) })
    expect(bundle.status).toBe(200)
    const bundleBody = (await bundle.json()) as { servedToday: Array<{ hhCode: string }> }
    expect(bundleBody.servedToday.length).toBeGreaterThanOrEqual(1)
  })
})

describe('admin distribution points', () => {
  it('creates and updates a point, and refuses a code change without dropping households', async () => {
    const admin = await login('admin.taiz')
    const created = await app.request('/api/admin/dps', {
      method: 'POST',
      headers: auth(admin.token),
      body: JSON.stringify({
        code: 'mdf06',
        nameEn: 'Sample site',
        nameAr: 'موقع تجريبي',
        district: 'Al-Mudhaffar',
        active: true,
      }),
    })
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({
      code: 'MDF06',
      nameEn: 'Sample site',
      nameAr: 'موقع تجريبي',
      district: 'Al-Mudhaffar',
      active: true,
    })

    const duplicate = await app.request('/api/admin/dps', {
      method: 'POST',
      headers: auth(admin.token),
      body: JSON.stringify({
        code: 'MDF06',
        nameEn: 'Again',
        nameAr: 'مرة أخرى',
        district: 'Al-Qahira',
      }),
    })
    expect(duplicate.status).toBe(409)
    expect(await duplicate.json()).toEqual({ error: 'dp_code_taken' })

    const bad = await app.request('/api/admin/dps', {
      method: 'POST',
      headers: auth(admin.token),
      body: JSON.stringify({
        code: 'MD F',
        nameEn: 'Bad code',
        nameAr: 'رمز سيئ',
        district: 'Al-Mudhaffar',
      }),
    })
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'invalid_dp_code' })

    const before = await app.request('/api/households?dp=MDF01', { headers: auth(admin.token) })
    const households = (await before.json()) as Array<{ hhCode: string; activeCardCode: string | null }>
    expect(households.map((row) => row.hhCode)).toContain('TZ-MDF01-000101')

    const edited = await app.request('/api/admin/dps/mdf01', {
      method: 'PATCH',
      headers: auth(admin.token),
      body: JSON.stringify({
        nameEn: 'Mudhaffar renamed',
        nameAr: 'المظفر بعد التعديل',
        district: 'Al-Mudhaffar',
        active: false,
      }),
    })
    expect(edited.status).toBe(200)
    expect(await edited.json()).toMatchObject({
      code: 'MDF01',
      nameEn: 'Mudhaffar renamed',
      nameAr: 'المظفر بعد التعديل',
      district: 'Al-Mudhaffar',
      active: false,
    })

    const refused = await app.request('/api/admin/dps/MDF01', {
      method: 'PATCH',
      headers: auth(admin.token),
      body: JSON.stringify({ code: 'MDF99', nameEn: 'Should not apply' }),
    })
    expect(refused.status).toBe(409)
    expect(await refused.json()).toEqual({ error: 'dp_code_immutable' })

    const after = await app.request('/api/households?dp=MDF01', { headers: auth(admin.token) })
    const still = (await after.json()) as Array<{ hhCode: string; activeCardCode: string | null }>
    expect(still).toEqual(households)
    expect(still.find((row) => row.hhCode === 'TZ-MDF01-000101')?.activeCardCode).toBe('CMDF01000101')

    const users = await app.request('/api/admin/users', { headers: auth(admin.token) })
    const rows = (await users.json()) as Array<{ username: string; dpCodes: string[] }>
    expect(rows.find((row) => row.username === 'focal.mudhaffar')?.dpCodes).toEqual(['MDF01', 'MDF02'])

    const list = await app.request('/api/admin/dps', { headers: auth(admin.token) })
    const points = (await list.json()) as Array<{ code: string; nameEn: string; nameAr: string; active: boolean }>
    expect(points.find((row) => row.code === 'MDF01')).toMatchObject({
      nameEn: 'Mudhaffar renamed',
      nameAr: 'المظفر بعد التعديل',
      active: false,
    })
    expect(points.find((row) => row.code === 'MDF06')?.nameEn).toBe('Sample site')
    expect(points.some((row) => row.code === 'MDF99')).toBe(false)
    const mdf01 = points.find((row) => row.code === 'MDF01') as {
      householdCount: number
      assignedUsers: Array<{ id: string; role: string }>
    }
    expect(mdf01.householdCount).toBeGreaterThan(0)
    expect(mdf01.assignedUsers.some((user) => user.role === 'dp_focal')).toBe(true)

    const usersFull = (await (await app.request('/api/admin/users', { headers: auth(admin.token) })).json()) as Array<{
      id: string
      username: string
      dpCodes: string[]
    }>
    const mealUser = usersFull.find((row) => row.username === 'meal.taiz')
    const focalUser = usersFull.find((row) => row.username === 'focal.mudhaffar')
    expect(mealUser && focalUser).toBeTruthy()
    const assigned = await app.request('/api/admin/dps/MDF06', {
      method: 'PATCH',
      headers: auth(admin.token),
      body: JSON.stringify({
        nameEn: 'Sample site',
        nameAr: 'موقع تجريبي',
        userIds: [mealUser!.id, focalUser!.id],
      }),
    })
    expect(assigned.status).toBe(200)
    const assignedBody = (await assigned.json()) as { assignedUsers: Array<{ id: string }> }
    expect(assignedBody.assignedUsers.map((user) => user.id).sort()).toEqual([mealUser!.id, focalUser!.id].sort())
    const focalAfter = (
      (await (await app.request('/api/admin/users', { headers: auth(admin.token) })).json()) as Array<{
        username: string
        dpCodes: string[]
      }>
    ).find((row) => row.username === 'focal.mudhaffar')
    expect(focalAfter?.dpCodes.sort()).toEqual(['MDF01', 'MDF02', 'MDF06'])
  })

  it('saves per-point GPS settings and blocks when the fence is enforced', async () => {
    const admin = await login('admin.taiz')
    const meal = await login('meal.taiz')
    async function newCard() {
      const created = await app.request('/api/households', {
        method: 'POST',
        headers: auth(meal.token),
        body: JSON.stringify({ dpCode: 'MDF01', beneficiaryCount: 3, label: 'GPS test' }),
      })
      expect(created.status).toBe(201)
      const hh = (await created.json()) as { cardCode: string }
      return hh.cardCode
    }
    const farCard = await newCard()
    const missingCard = await newCard()
    const nearCard = await newCard()
    const offCard = await newCard()

    const patched = await app.request('/api/admin/dps/MDF01', {
      method: 'PATCH',
      headers: auth(admin.token),
      body: JSON.stringify({
        latitude: 13.58,
        longitude: 44.02,
        gpsRadiusM: 100,
        gpsCheckActive: true,
      }),
    })
    expect(patched.status).toBe(200)
    const body = (await patched.json()) as {
      latitude: number
      longitude: number
      gpsRadiusM: number
      gpsCheckActive: boolean
    }
    expect(body.gpsCheckActive).toBe(true)
    expect(body.gpsRadiusM).toBe(100)
    expect(body.latitude).toBeCloseTo(13.58)

    const focal = await login('focal.mudhaffar')
    const far = await postScan(
      focal.token,
      scan(focal.user.id, {
        cardCode: farCard,
        latitude: 13.6,
        longitude: 44.02,
        locationAccuracyM: 12,
      }),
    )
    expect(far.status).toBe(200)
    expect(far.json.scan?.result).toBe('Blocked')
    expect(far.json.scan?.blockReason).toBe('out_of_geofence')
    expect(far.json.scan?.countsAsDistributed).toBe(false)
    const farStored = far.json.scan as { latitude?: number; longitude?: number }
    expect(farStored.latitude).toBeCloseTo(13.6)
    expect(farStored.longitude).toBeCloseTo(44.02)

    const missing = await postScan(focal.token, scan(focal.user.id, { cardCode: missingCard }))
    expect(missing.json.scan?.blockReason).toBe('location_required')

    const near = await postScan(
      focal.token,
      scan(focal.user.id, {
        cardCode: nearCard,
        latitude: 13.5801,
        longitude: 44.02,
        locationAccuracyM: 8,
      }),
    )
    expect(near.json.scan?.result).toBe('Served')
    expect(near.json.scan?.countsAsDistributed).toBe(true)

    const off = await app.request('/api/admin/dps/MDF01', {
      method: 'PATCH',
      headers: auth(admin.token),
      body: JSON.stringify({ gpsCheckActive: false }),
    })
    expect(off.status).toBe(200)
    const stillFar = await postScan(
      focal.token,
      scan(focal.user.id, {
        cardCode: offCard,
        latitude: 13.6,
        longitude: 44.02,
      }),
    )
    expect(stillFar.json.scan?.result).toBe('Served')
    const still = stillFar.json.scan as { latitude?: number }
    expect(still.latitude).toBeCloseTo(13.6)
  })
})

describe('household edit', () => {
  it('lets meal reassign a household to another DP and rename it without changing hh_code', async () => {
    const meal = await login('meal.taiz')
    const created = await app.request('/api/households', {
      method: 'POST',
      headers: auth(meal.token),
      body: JSON.stringify({ dpCode: 'MDF01', beneficiaryCount: 5, label: 'Old Name' }),
    })
    expect(created.status).toBe(201)
    const hh = (await created.json()) as { hhCode: string; cardCode: string; dpCode: string; label: string | null }
    expect(hh.dpCode).toBe('MDF01')
    expect(hh.hhCode.startsWith('TZ-MDF01-')).toBe(true)

    const patched = await app.request(`/api/households/${hh.hhCode}`, {
      method: 'PATCH',
      headers: auth(meal.token),
      body: JSON.stringify({ dpCode: 'MDF02', label: 'New Family', beneficiaryCount: 7 }),
    })
    expect(patched.status).toBe(200)
    const body = (await patched.json()) as {
      hhCode: string
      dpCode: string
      label: string | null
      beneficiaryCount: number
      previousDpCode: string
    }
    expect(body.hhCode).toBe(hh.hhCode)
    expect(body.dpCode).toBe('MDF02')
    expect(body.previousDpCode).toBe('MDF01')
    expect(body.label).toBe('New Family')
    expect(body.beneficiaryCount).toBe(7)

    const got = await app.request(`/api/households/${hh.hhCode}`, { headers: auth(meal.token) })
    const detail = (await got.json()) as { hhCode: string; dpCode: string; label: string | null; beneficiaryCount: number }
    expect(detail.hhCode).toBe(hh.hhCode)
    expect(detail.dpCode).toBe('MDF02')
    expect(detail.label).toBe('New Family')
    expect(detail.beneficiaryCount).toBe(7)

    const byName = await app.request('/api/households?q=New%20Family', { headers: auth(meal.token) })
    const list = (await byName.json()) as Array<{ hhCode: string }>
    expect(list.some((row) => row.hhCode === hh.hhCode)).toBe(true)

    // Scan at the new point should serve; old point should be wrong_dp.
    const focalNew = await login('focal.mudhaffar') // has MDF01 and MDF02
    const atNew = await postScan(
      focalNew.token,
      scan(focalNew.user.id, { cardCode: hh.cardCode, dpCode: 'MDF02', deviceId: 'tablet-reassign-1' }),
    )
    expect(atNew.status).toBe(200)
    expect(atNew.json.scan?.result).toBe('Served')

    const meal2 = await login('meal.taiz')
    const created2 = await app.request('/api/households', {
      method: 'POST',
      headers: auth(meal2.token),
      body: JSON.stringify({ dpCode: 'MDF01', beneficiaryCount: 3, label: 'Move Block' }),
    })
    const hh2 = (await created2.json()) as { hhCode: string; cardCode: string }
    const wrong = await postScan(
      focalNew.token,
      scan(focalNew.user.id, {
        cardCode: hh2.cardCode,
        dpCode: 'MDF02',
        deviceId: 'tablet-reassign-2',
        scannedAt: new Date(Date.now() + 2_000).toISOString(),
      }),
    )
    expect(wrong.json.scan?.blockReason).toBe('wrong_dp')
  })

  it('forbids focals from editing households', async () => {
    const focal = await login('focal.mudhaffar')
    const response = await app.request('/api/households/TZ-MDF01-000101', {
      method: 'PATCH',
      headers: auth(focal.token),
      body: JSON.stringify({ label: 'Nope' }),
    })
    expect(response.status).toBe(403)
  })
})

describe('card template', () => {
  it('lets admin save and read the entitlement card template', async () => {
    const admin = await login('admin.taiz')
    const meal = await login('meal.taiz')
    const forbidden = await app.request('/api/admin/card-template', {
      method: 'PUT',
      headers: auth(meal.token),
      body: JSON.stringify({ titleEn: 'Nope' }),
    })
    expect(forbidden.status).toBe(403)

    const saved = await app.request('/api/admin/card-template', {
      method: 'PUT',
      headers: auth(admin.token),
      body: JSON.stringify({
        titleEn: 'Hot Meal Entitlement Card – Free of Charge',
        wfpHotline: '800-WFP',
        hdpHotline: '800-HDP',
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
        printBatch: 'BATCH-A1',
        rulesText: 'Rule one\nRule two',
        showWfpLogo: true,
        showHdpLogo: false,
      }),
    })
    expect(saved.status).toBe(200)
    const body = (await saved.json()) as { wfpHotline: string; showHdpLogo: boolean; printBatch: string }
    expect(body.wfpHotline).toBe('800-WFP')
    expect(body.showHdpLogo).toBe(false)
    expect(body.printBatch).toBe('BATCH-A1')

    const read = await app.request('/api/card-template', { headers: auth(meal.token) })
    expect(read.status).toBe(200)
    const publicBody = (await read.json()) as { hdpHotline: string; validTo: string }
    expect(publicBody.hdpHotline).toBe('800-HDP')
    expect(publicBody.validTo).toBe('2026-12-31')

    const created = await app.request('/api/households', {
      method: 'POST',
      headers: auth(meal.token),
      body: JSON.stringify({ dpCode: 'MDF01', beneficiaryCount: 4, label: 'Card Sample' }),
    })
    expect(created.status).toBe(201)
    const hh = (await created.json()) as { hhCode: string; printBatch: string; wfpHotline: string; showHdpLogo: boolean }
    expect(hh.printBatch).toBe('BATCH-A1')
    expect(hh.wfpHotline).toBe('800-WFP')
    expect(hh.showHdpLogo).toBe(false)
  })
})

describe('admin audit log', () => {
  it('returns a feed after admin mutations and includes legacy production history', async () => {
    const admin = await login('admin.taiz')
    const meal = await login('meal.taiz')

    const template = await app.request('/api/admin/card-template', {
      method: 'PUT',
      headers: auth(admin.token),
      body: JSON.stringify({ primaryColor: '#0B5C6B', titleAr: 'بطاقة أسرة مستفيدة' }),
    })
    expect(template.status).toBe(200)

    const prod = await app.request('/api/production', {
      method: 'POST',
      headers: auth(meal.token),
      body: JSON.stringify({ dpCode: 'MDF01', productionDate: '2026-10-28', mealsPrepared: 42 }),
    })
    expect(prod.status).toBe(200)

    const forbidden = await app.request('/api/admin/audit-log', { headers: auth(meal.token) })
    expect(forbidden.status).toBe(403)

    const feed = await app.request('/api/admin/audit-log?limit=100', { headers: auth(admin.token) })
    expect(feed.status).toBe(200)
    const rows = (await feed.json()) as Array<{ action: string; entityType: string; summary: string }>
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.some((r) => r.entityType === 'card_template' || r.action.includes('template'))).toBe(true)
    expect(rows.some((r) => r.entityType === 'production')).toBe(true)

    const filtered = await app.request('/api/admin/audit-log?entityType=production', {
      headers: auth(admin.token),
    })
    expect(filtered.status).toBe(200)
    const prodOnly = (await filtered.json()) as Array<{ entityType: string }>
    expect(prodOnly.every((r) => r.entityType === 'production')).toBe(true)
  })
})
describe('reports', () => {
  it('aggregates served scans by DP and district for MEAL; blocks dp_focal', async () => {
    const focal = await login('focal.mudhaffar')
    expect((await postScan(focal.token, scan(focal.user.id))).status).toBeLessThan(300)
    const meal = await login('meal.taiz')
    const today = adenDate()
    const res = await app.request(`/api/reports?from=${today}&to=${today}`, { headers: auth(meal.token) })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { totals: { served: number; uniqueHh: number }; byDp: Array<{ dpCode: string; served: number }>; byDistrict: unknown[]; byDay: unknown[] }
    expect(body.totals.served).toBe(1)
    expect(body.totals.uniqueHh).toBe(1)
    expect(body.byDp.find((r) => r.dpCode === 'MDF01')?.served).toBe(1)
    expect(body.byDistrict.length).toBeGreaterThan(0)
    expect(body.byDay.length).toBe(1)
    const filtered = await app.request(`/api/reports?from=${today}&to=${today}&district=Al-Qahira`, { headers: auth(meal.token) })
    expect(((await filtered.json()) as { totals: { served: number } }).totals.served).toBe(0)
    const denied = await app.request(`/api/reports?from=${today}&to=${today}`, { headers: auth(focal.token) })
    expect(denied.status).toBe(403)
  })
})

describe('power bi feed', () => {
  it('requires a key, serves JSON/CSV with key, and blocks after revoke', async () => {
    const admin = await login('admin.taiz')
    expect((await app.request('/api/powerbi/daily')).status).toBe(401)
    const rot = await app.request('/api/admin/powerbi-key', { method: 'POST', headers: auth(admin.token) })
    const { key } = (await rot.json()) as { key: string }
    expect(key.startsWith('hdpbi_')).toBe(true)
    const dps = await app.request(`/api/powerbi/distribution_points?key=${key}`)
    expect(dps.status).toBe(200)
    expect(((await dps.json()) as unknown[]).length).toBeGreaterThan(0)
    for (const f of ['focal_points', 'households', 'production', 'scans', 'daily', 'cards']) {
      const r = await app.request(`/api/powerbi/${f}?from=2026-01-01&to=2030-01-01`, { headers: { 'x-api-key': key } })
      expect(r.status, f).toBe(200)
    }
    const fp = (await (await app.request(`/api/powerbi/focal_points?key=${key}`)).text())
    expect(fp).not.toContain('password')
    const csv = await app.request(`/api/powerbi/households.csv?key=${key}`)
    expect(csv.headers.get('content-type')).toContain('text/csv')
    const meal = await login('meal.taiz')
    expect((await app.request('/api/powerbi/daily', { headers: auth(meal.token) })).status).toBe(200)
    const focal = await login('focal.mudhaffar')
    expect((await app.request('/api/powerbi/daily', { headers: auth(focal.token) })).status).toBe(401)
    await app.request('/api/admin/powerbi-key', { method: 'DELETE', headers: auth(admin.token) })
    expect((await app.request(`/api/powerbi/daily?key=${key}`)).status).toBe(401)
  })
})
