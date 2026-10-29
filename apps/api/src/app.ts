import { existsSync } from 'node:fs'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from '@hono/node-server/serve-static'
import { z } from 'zod'
import { adenDate, ROLES } from '@hdp/rules'
import { readSubject, signToken } from './auth.js'
import type { Database } from './db.js'
import {
  applyScans,
  createDp,
  createHousehold,
  updateHousehold,
  createSpotCheck,
  createUser,
  dashboard,
  exportRegister,
  getCardTemplate,
  getHousehold,
  getScan,
  HttpError,
  listDevices,
  listDps,
  listHouseholds,
  listPrintableHouseholds,
  listAdminActivity,
  listUsers,
  loadActor,
  login,
  patchDp,
  deleteUser,
  updateUser,
  reconciliation,
  reports,
  reissueCard,
  saveCardTemplate,
  syncBundle,
  upsertProduction,
  voidCard,
  type Actor,
  type IncomingScan,
} from './domain.js'

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const scanSchema = z.object({
  id: uuid,
  cardCode: z.string().trim().min(4).max(40).nullish(),
  hhCode: z.string().trim().min(8).max(24).nullish(),
  dpCode: z.string().trim().min(2).max(8),
  scannedAt: z.string().min(10),
  mode: z.enum(['card', 'manual']),
  clientResult: z.enum(['Served', 'Blocked', 'Override', 'ManualException']),
  clientBlockReason: z.string().max(40).nullish(),
  overrideReason: z.string().max(300).nullish(),
  supervisorPin: z.string().min(4).max(8).nullish(),
  offlineFlag: z.boolean().optional(),
  deviceId: z.string().trim().min(4).max(80),
  deviceLabel: z.string().trim().max(120).nullish(),
  operatorId: uuid,
  latitude: z.number().gte(-90).lte(90).nullish(),
  longitude: z.number().gte(-180).lte(180).nullish(),
  locationAccuracyM: z.number().gte(0).lte(100000).nullish(),
})

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new HttpError(400, 'invalid_body')
  return parsed.data
}

export function createApp(db: Database, options?: { distDir?: string }) {
  const app = new Hono<{ Variables: { actor: Actor } }>()
  app.use('*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type'] }))
  app.onError((error, c) => {
    if (error instanceof HttpError) {
      return c.json({ error: error.code }, error.status as 400)
    }
    console.error(error)
    return c.json({ error: 'server_error' }, 500)
  })

  app.get('/api/health', (c) => c.json({ ok: true, service: 'hdp-meal-verify', timeZone: 'Asia/Aden' }))

  app.post('/api/auth/login', async (c) => {
    const body = parse(
      z.object({ username: z.string().min(3).max(32), password: z.string().min(8).max(80) }),
      await c.req.json(),
    )
    const actor = await login(db, body.username, body.password)
    const token = await signToken(actor)
    return c.json({ ...token, user: actor })
  })

  app.use('/api/*', async (c, next) => {
    if (c.req.path === '/api/health' || c.req.path === '/api/auth/login') return next()
    const header = c.req.header('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) throw new HttpError(401, 'unauthorized')
    const actor = await loadActor(db, await readSubject(token))
    if (!actor) throw new HttpError(401, 'unauthorized')
    c.set('actor', actor)
    await next()
  })

  app.get('/api/auth/me', (c) => c.json({ user: c.get('actor') }))
  app.get('/api/dps', async (c) => {
    const actor = c.get('actor')
    const rows = await listDps(db)
    return c.json(actor.role === 'admin' ? rows : rows.filter((dp) => actor.dpCodes.includes(dp.code)))
  })
  app.get('/api/sync/bundle', async (c) => c.json(await syncBundle(db, c.get('actor'))))

  app.post('/api/scans', async (c) => {
    const scan = parse(scanSchema, await c.req.json()) as IncomingScan
    const [result] = await applyScans(db, c.get('actor'), [scan])
    if (!result?.ok) return c.json({ error: result?.error ?? 'rejected' }, 400)
    return c.json(result)
  })

  app.post('/api/sync/scans', async (c) => {
    const body = parse(z.object({ scans: z.array(scanSchema).min(1).max(200) }), await c.req.json())
    return c.json({ results: await applyScans(db, c.get('actor'), body.scans as IncomingScan[]) })
  })

  app.get('/api/scans/:id', async (c) => c.json(await getScan(db, c.get('actor'), c.req.param('id'))))
  app.get('/api/dashboard', async (c) => {
    const date = c.req.query('date') ?? adenDate()
    if (!day.safeParse(date).success) throw new HttpError(400, 'invalid_body')
    return c.json(await dashboard(db, c.get('actor'), date, c.req.query('dp') || undefined))
  })

  app.get('/api/households', async (c) =>
    c.json(await listHouseholds(db, c.get('actor'), { q: c.req.query('q'), dp: c.req.query('dp') })),
  )
  app.get('/api/households/print-pack', async (c) =>
    c.json(
      await listPrintableHouseholds(db, c.get('actor'), {
        q: c.req.query('q'),
        dp: c.req.query('dp'),
        limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined,
      }),
    ),
  )
  app.post('/api/households', async (c) => {
    const body = parse(
      z.object({
        dpCode: z.string().min(2).max(8),
        beneficiaryCount: z.number().int().min(1).max(30),
        label: z.string().max(80).nullish(),
      }),
      await c.req.json(),
    )
    return c.json(await createHousehold(db, c.get('actor'), body), 201)
  })
  app.get('/api/households/:hhCode', async (c) => c.json(await getHousehold(db, c.get('actor'), c.req.param('hhCode'))))
  app.patch('/api/households/:hhCode', async (c) => {
    const body = parse(
      z
        .object({
          dpCode: z.string().min(2).max(8).optional(),
          label: z.string().max(80).nullish(),
          beneficiaryCount: z.number().int().min(1).max(30).optional(),
        })
        .refine((value) => value.dpCode !== undefined || value.label !== undefined || value.beneficiaryCount !== undefined, {
          message: 'empty',
        }),
      await c.req.json(),
    )
    return c.json(await updateHousehold(db, c.get('actor'), c.req.param('hhCode'), body))
  })
  app.post('/api/households/:hhCode/void', async (c) => {
    const body = parse(z.object({ reason: z.string().min(3).max(300) }), await c.req.json())
    return c.json(await voidCard(db, c.get('actor'), c.req.param('hhCode'), body.reason))
  })
  app.post('/api/households/:hhCode/reissue', async (c) => {
    const body = parse(z.object({ reason: z.string().min(3).max(300) }), await c.req.json())
    return c.json(await reissueCard(db, c.get('actor'), c.req.param('hhCode'), body.reason))
  })

  app.post('/api/production', async (c) => {
    const body = parse(
      z.object({
        dpCode: z.string().min(2).max(8),
        productionDate: day,
        mealsPrepared: z.number().int().min(0).max(20000),
        notes: z.string().max(200).nullish(),
      }),
      await c.req.json(),
    )
    return c.json(await upsertProduction(db, c.get('actor'), body))
  })
  app.get('/api/reconciliation', async (c) => {
    const date = c.req.query('date') ?? adenDate()
    if (!day.safeParse(date).success) throw new HttpError(400, 'invalid_body')
    return c.json(await reconciliation(db, c.get('actor'), date))
  })
  app.get('/api/reports', async (c) => {
    const to = c.req.query('to') ?? adenDate()
    const from = c.req.query('from') ?? to
    if (!day.safeParse(from).success || !day.safeParse(to).success) throw new HttpError(400, 'invalid_body')
    const district = c.req.query('district') || undefined
    if (district && !['Al-Mudhaffar', 'Al-Qahira'].includes(district)) throw new HttpError(400, 'invalid_body')
    return c.json(
      await reports(db, c.get('actor'), {
        from,
        to,
        dp: c.req.query('dp') || undefined,
        district,
        operator: c.req.query('operator') || undefined,
      }),
    )
  })
  app.post('/api/spot-checks', async (c) => {
    const body = parse(
      z.object({
        dpCode: z.string().min(2).max(8),
        hhCode: z.string().max(24).nullish(),
        finding: z.string().min(3).max(80),
        notes: z.string().max(200).nullish(),
      }),
      await c.req.json(),
    )
    return c.json(await createSpotCheck(db, c.get('actor'), body), 201)
  })
  app.get('/api/export/register.csv', async (c) => {
    const date = c.req.query('date') ?? adenDate()
    if (!day.safeParse(date).success) throw new HttpError(400, 'invalid_body')
    const csv = await exportRegister(db, c.get('actor'), date, c.req.query('dp') || undefined)
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="hdp-register-${date}.csv"`,
      },
    })
  })

  app.get('/api/card-template', async (c) => c.json(await getCardTemplate(db)))

  app.use('/api/admin/*', async (c, next) => {

    if (c.get('actor').role !== 'admin') throw new HttpError(403, 'forbidden')
    await next()
  })
  app.get('/api/admin/dps', async (c) => c.json(await listDps(db)))
  app.post('/api/admin/dps', async (c) => {
    const body = parse(
      z.object({
        code: z.string().trim().min(1).max(16),
        nameEn: z.string().trim().min(2).max(80),
        nameAr: z.string().trim().min(2).max(80),
        district: z.enum(['Al-Mudhaffar', 'Al-Qahira']),
        active: z.boolean().optional(),
        latitude: z.number().gte(-90).lte(90).nullish(),
        longitude: z.number().gte(-180).lte(180).nullish(),
        gpsRadiusM: z.number().gte(10).lte(5000).nullish(),
        gpsCheckActive: z.boolean().optional(),
      }),
      await c.req.json(),
    )
    return c.json(await createDp(db, body, c.get('actor')), 201)
  })
  app.patch('/api/admin/dps/:code', async (c) => {
    const body = parse(
      z.object({
        code: z.string().trim().min(1).max(16).optional(),
        active: z.boolean().optional(),
        nameEn: z.string().trim().min(2).max(80).optional(),
        nameAr: z.string().trim().min(2).max(80).optional(),
        district: z.enum(['Al-Mudhaffar', 'Al-Qahira']).optional(),
        userIds: z.array(z.string().min(1).max(64)).max(200).optional(),
        latitude: z.number().gte(-90).lte(90).nullish(),
        longitude: z.number().gte(-180).lte(180).nullish(),
        gpsRadiusM: z.number().gte(10).lte(5000).nullish(),
        gpsCheckActive: z.boolean().optional(),
      }),
      await c.req.json(),
    )
    return c.json(await patchDp(db, c.req.param('code'), body, c.get('actor')))
  })
  app.get('/api/admin/users', async (c) => c.json(await listUsers(db)))
  app.post('/api/admin/users', async (c) => {
    const body = parse(
      z.object({
        username: z.string().regex(/^[a-z0-9._-]{3,32}$/),
        displayName: z.string().min(2).max(80),
        password: z.string().min(8).max(80),
        role: z.enum(ROLES),
        dpCodes: z.array(z.string().min(2).max(8)).max(30),
        pin: z.string().regex(/^\d{4,8}$/).nullish(),
      }),
      await c.req.json(),
    )
    return c.json(await createUser(db, body, c.get('actor')), 201)
  })
  app.patch('/api/admin/users/:id', async (c) => {
    const body = parse(
      z.object({
        displayName: z.string().min(2).max(80).optional(),
        username: z.string().regex(/^[a-z0-9._-]{3,32}$/).optional(),
        role: z.enum(ROLES).optional(),
        password: z.string().min(8).max(80).optional(),
        pin: z.string().regex(/^\d{4,8}$/).nullish(),
        dpCodes: z.array(z.string().min(2).max(8)).max(30).optional(),
        active: z.boolean().optional(),
      }),
      await c.req.json(),
    )
    return c.json(await updateUser(db, c.req.param('id'), body, c.get('actor')))
  })
  app.delete('/api/admin/users/:id', async (c) => {
    return c.json(await deleteUser(db, c.get('actor').id, c.req.param('id')))
  })
  app.get('/api/admin/devices', async (c) => c.json(await listDevices(db)))
  app.get('/api/admin/audit-log', async (c) =>
    c.json(
      await listAdminActivity(db, {
        q: c.req.query('q'),
        entityType: c.req.query('entityType'),
        limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined,
      }),
    ),
  )
  app.get('/api/admin/card-template', async (c) => c.json(await getCardTemplate(db)))
  app.put('/api/admin/card-template', async (c) => {
    const body = parse(
      z.object({
        titleEn: z.string().max(120).optional(),
        titleAr: z.string().max(120).optional(),
        projectTitleAr: z.string().max(120).optional(),
        primaryColor: z.string().max(20).optional(),
        showWfpLogo: z.boolean().optional(),
        showHdpLogo: z.boolean().optional(),
        wfpLogoDataUrl: z.string().max(400_000).nullish(),
        hdpLogoDataUrl: z.string().max(400_000).nullish(),
        rulesText: z.string().max(2000).optional(),
        freeLineEn: z.string().max(200).optional(),
        freeLineAr: z.string().max(200).optional(),
        complaintsHeadingAr: z.string().max(120).optional(),
        hotlineHeadingAr: z.string().max(80).optional(),
        hdpPanelTitleAr: z.string().max(120).optional(),
        hdpPhone: z.string().max(80).optional(),
        hdpWhatsapp: z.string().max(80).optional(),
        partnerPanelTitleAr: z.string().max(120).optional(),
        partnerPhone: z.string().max(80).optional(),
        partnerWhatsapp: z.string().max(80).optional(),
        reassuranceTextAr: z.string().max(400).optional(),
        personalNoticeAr: z.string().max(300).optional(),
        wfpHotline: z.string().max(80).optional(),
        hdpHotline: z.string().max(80).optional(),
        validFrom: z.string().max(40).optional(),
        validTo: z.string().max(40).optional(),
        printBatch: z.string().max(60).optional(),
        showSerial: z.boolean().optional(),
        showBatch: z.boolean().optional(),
        serialPrefix: z.string().max(40).optional(),
      }),
      await c.req.json(),
    )
    return c.json(await saveCardTemplate(db, c.get('actor'), body))
  })

  app.all('/api/*', () => {
    throw new HttpError(404, 'not_found')
  })

  if (options?.distDir && existsSync(options.distDir)) {
    app.use('/*', serveStatic({ root: options.distDir }))
    app.get('*', serveStatic({ root: options.distDir, path: 'index.html' }))
  }

  return app
}
