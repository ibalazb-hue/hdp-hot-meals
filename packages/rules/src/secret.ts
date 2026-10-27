import { scrypt } from '@noble/hashes/scrypt.js'
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js'

const PARAMS = { N: 1 << 15, r: 8, p: 1, dkLen: 32 } as const

export function hashSecret(secret: string): string {
  const salt = randomBytes(16)
  const hash = scrypt(utf8ToBytes(secret), salt, PARAMS)
  return `${bytesToHex(salt)}$${bytesToHex(hash)}`
}

export function verifySecret(secret: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split('$')
  if (!saltHex || !hashHex || !/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) {
    return false
  }
  const actual = bytesToHex(scrypt(utf8ToBytes(secret), hexToBytes(saltHex), PARAMS))
  if (actual.length !== hashHex.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i += 1) {
    diff |= actual.charCodeAt(i) ^ hashHex.charCodeAt(i)
  }
  return diff === 0
}
