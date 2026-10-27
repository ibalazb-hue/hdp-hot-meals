import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { createDatabase, migrate } from './db.js'
import { seed } from './seed.js'

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required when NODE_ENV=production')
}

const db = await createDatabase()
await migrate(db)
// Production: seed only when SEED=true. Dev/test: seed unless SEED=false.
const allowSeed =
  process.env.NODE_ENV === 'production'
    ? process.env.SEED === 'true'
    : process.env.SEED !== 'false'
if (allowSeed) await seed(db)

const training = await db.query(`SELECT username FROM users WHERE username = 'admin.taiz' AND active = TRUE`)
if (training.length > 0) {
  console.warn('TRAINING USERS ARE ACTIVE. Replace them before a live distribution.')
}

const dist = join(dirname(fileURLToPath(import.meta.url)), '../../web/dist')
const app = createApp(db, { distDir: existsSync(dist) ? dist : undefined })
const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port }, () => {
  console.log(`HDP meal verification listening on http://localhost:${port}`)
})
