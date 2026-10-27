import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiJson } from './api'
import { clearSession, getSession, saveSession, type Session } from './db'
import { syncAll } from './submit'

interface AuthValue {
  session: Session | null
  ready: boolean
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue>({
  session: null,
  ready: false,
  signIn: async () => undefined,
  signOut: async () => undefined,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    getSession()
      .then((stored) => setSession(stored))
      .finally(() => setReady(true))
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      session,
      ready,
      async signIn(username: string, password: string) {
        const body = await apiJson<{ token: string; expiresAt: string; user: Session['user'] }>(
          '/api/auth/login',
          { method: 'POST', body: JSON.stringify({ username, password }) },
          null,
        )
        const next = { token: body.token, expiresAt: body.expiresAt, user: body.user }
        await saveSession(next)
        setSession(next)
        await syncAll()
      },
      async signOut() {
        await clearSession()
        setSession(null)
      },
    }),
    [session, ready],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
