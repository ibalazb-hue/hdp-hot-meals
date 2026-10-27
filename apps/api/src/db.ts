import { mkdir, readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import pg from 'pg'

export type Row = Record<string, unknown>

export interface Queryable {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>
}

export interface Database extends Queryable {
  exec(sql: string): Promise<void>
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>
  close(): Promise<void>
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../../../db/migrations')

export function sqlStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((part) => part.trim())
    .filter((part) => part.replace(/--[^\n]*/g, '').trim().length > 0)
}

export async function migrate(db: Database): Promise<void> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`)
  const applied = new Set((await db.query<{ id: string }>('SELECT id FROM schema_migrations')).map((row) => row.id))
  if (!applied.has('001_init.sql')) {
    const existing = await db.query<{ name: string | null }>(`SELECT to_regclass('public.distribution_points') AS name`)
    if (existing[0]?.name) {
      await db.query(`INSERT INTO schema_migrations (id) VALUES ('001_init.sql')`)
      applied.add('001_init.sql')
    }
  }
  const names = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort()
  for (const name of names) {
    if (applied.has(name)) continue
    const sql = await readFile(join(migrationsDir, name), 'utf8')
    for (const statement of sqlStatements(sql)) await db.exec(statement)
    await db.query(`INSERT INTO schema_migrations (id) VALUES ($1)`, [name])
  }
}

export async function createDatabase(options?: { memory?: boolean; databaseUrl?: string }): Promise<Database> {
  const databaseUrl = options?.databaseUrl ?? (options?.memory ? undefined : process.env.DATABASE_URL)
  if (databaseUrl) return wrapPg(databaseUrl)
  const folder = options?.memory ? undefined : join(dirname(fileURLToPath(import.meta.url)), '../data/hdp')
  if (folder) await mkdir(dirname(folder), { recursive: true })
  const client = new PGlite(folder)
  await client.waitReady
  return {
    async query<T = Row>(sql: string, params: unknown[] = []) {
      const result = await client.query<T>(sql, params)
      return result.rows
    },
    async exec(sql: string) {
      await client.exec(sql)
    },
    transaction(fn) {
      return client.transaction(async (tx) =>
        fn({
          query: async <T = Row>(sql: string, params: unknown[] = []) => {
            const result = await tx.query<T>(sql, params)
            return result.rows
          },
        }),
      )
    },
    close: () => client.close(),
  }
}

function wrapPg(connectionString: string): Database {
  const pool = new pg.Pool({ connectionString })
  const queryable = (target: pg.Pool | pg.PoolClient): Queryable => ({
    async query<T = Row>(sql: string, params: unknown[] = []) {
      const result = await target.query(sql, params)
      return result.rows as T[]
    },
  })
  return {
    ...queryable(pool),
    async exec(sql: string) {
      await pool.query(sql)
    },
    async transaction(fn) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const value = await fn(queryable(client))
        await client.query('COMMIT')
        return value
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

export function asText(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

export function asBool(value: unknown): boolean {
  return value === true || value === 't' || value === 'true' || value === 1
}
