import { clearSession, getSession } from './db'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code)
  }
}

export async function api(path: string, init: RequestInit = {}, token?: string | null): Promise<Response> {
  const session = token === undefined ? await getSession() : null
  const bearer = token === undefined ? session?.token : token
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  if (bearer) headers.set('authorization', `Bearer ${bearer}`)
  try {
    const response = await fetch(path, { ...init, headers })
    if (response.status === 401 && token === undefined) await clearSession()
    return response
  } catch {
    throw new ApiError(0, 'offline')
  }
}

export async function apiJson<T>(path: string, init?: RequestInit, token?: string | null): Promise<T> {
  const response = await api(path, init, token)
  const body = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new ApiError(response.status, body.error ?? 'request_failed')
  return body as T
}
