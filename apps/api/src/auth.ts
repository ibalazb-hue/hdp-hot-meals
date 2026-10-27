import { SignJWT, jwtVerify } from 'jose'
import type { Actor } from './domain.js'
import { HttpError } from './domain.js'

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET ?? 'hdp-dev-only-change-before-live-use'
  return new TextEncoder().encode(secret)
}

export async function signToken(actor: Actor): Promise<{ token: string; expiresAt: string }> {
  const exp = Math.floor(Date.now() / 1000) + 18 * 60 * 60
  const token = await new SignJWT({ role: actor.role, username: actor.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(actor.id)
    .setExpirationTime(exp)
    .sign(secretKey())
  return { token, expiresAt: new Date(exp * 1000).toISOString() }
}

export async function readSubject(token: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, secretKey())
    if (!payload.sub) throw new HttpError(401, 'unauthorized')
    return payload.sub
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(401, 'unauthorized')
  }
}
