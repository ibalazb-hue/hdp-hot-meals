import { chmodSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const binDir = join(process.cwd(), 'node_modules', '.bin')
if (!existsSync(binDir)) process.exit(0)
for (const name of readdirSync(binDir)) {
  const path = join(binDir, name)
  try {
    if (statSync(path).isFile()) chmodSync(path, 0o755)
  } catch {
    /* ignore Windows / locked files */
  }
}
