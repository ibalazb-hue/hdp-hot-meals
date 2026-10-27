const HH_CODE = /^TZ-[A-Z0-9]{2,8}-\d{6}$/
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function normalizeHhCode(value: string): string {
  return value.trim().toUpperCase()
}

export function isHhCode(value: string): boolean {
  return HH_CODE.test(normalizeHhCode(value))
}

export function formatHhCode(dpCode: string, sequence: number): string {
  return `TZ-${dpCode.toUpperCase()}-${String(sequence).padStart(6, '0')}`
}

export function cardPayload(cardCode: string, hhCode: string): string {
  return `HDP1|${cardCode}|${hhCode}`
}

export function parseCardPayload(raw: string): { cardCode?: string; hhCode?: string } {
  const text = raw.trim()
  if (!text) return {}
  if (text.toUpperCase().startsWith('HDP1|')) {
    const parts = text.split('|')
    const cardCode = parts[1]?.trim().toUpperCase()
    const hhCode = parts[2] ? normalizeHhCode(parts[2]) : undefined
    return { cardCode: cardCode || undefined, hhCode }
  }
  const upper = normalizeHhCode(text)
  if (isHhCode(upper)) return { hhCode: upper }
  const compact = upper.replace(/\s+/g, '')
  return compact ? { cardCode: compact } : {}
}

export function newCardCode(): string {
  const bytes = new Uint8Array(10)
  globalThis.crypto.getRandomValues(bytes)
  let code = 'C'
  for (const byte of bytes) {
    code += ALPHABET[byte % ALPHABET.length]
  }
  return code
}
