import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../apps/web/public/icons')
mkdirSync(root, { recursive: true })

function crc32(buf) {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0)
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data])
  const out = Buffer.alloc(12 + body.length)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), 8 + body.length)
  return out
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  const teal = [14, 58, 69]
  const paper = [243, 239, 228]
  const gold = [244, 197, 109]
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x += 1) {
      const nx = x / size
      const ny = y / size
      let color = teal
      const inBowl = (nx - 0.5) ** 2 / 0.22 ** 2 + (ny - 0.58) ** 2 / 0.12 ** 2 <= 1
      const rim = (nx - 0.5) ** 2 / 0.22 ** 2 + (ny - 0.52) ** 2 / 0.045 ** 2 <= 1
      if (inBowl || rim) color = paper
      const steam = [0.42, 0.5, 0.58].some((sx) => Math.abs(nx - sx) < 0.012 && ny > 0.28 && ny < 0.42)
      if (steam) color = gold
      const i = y * (size * 4 + 1) + 1 + x * 4
      raw[i] = color[0]
      raw[i + 1] = color[1]
      raw[i + 2] = color[2]
      raw[i + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

writeFileSync(join(root, 'icon-192.png'), png(192))
writeFileSync(join(root, 'icon-512.png'), png(512))
