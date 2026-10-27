import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { ApiError } from '../api'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { BrandLogos } from '../components/BrandLogos'
import { Button, Field, Panel, TextInput } from '../components/ui'

export function LoginPage() {
  const { session, ready, signIn } = useAuth()
  const { t, locale, setLocale } = useI18n()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (ready && session) return <Navigate to="/" replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await signIn(username, password)
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'offline' ? t('offline') : t('invalidLogin'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <BrandLogos className="h-14" />
            <h1 className="mt-3 text-3xl font-bold leading-tight">{t('appName')}</h1>
            <p className="text-sm text-muted">{t('appPlace')}</p>
          </div>
          <button className="min-h-11 rounded-full bg-white px-4 font-bold shadow-sm" onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}>
            {locale === 'en' ? 'عربي' : 'EN'}
          </button>
        </div>
        <Panel>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <Field label={t('username')}>
              <TextInput data-testid="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
            </Field>
            <Field label={t('password')}>
              <TextInput
                data-testid="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            {error ? <p className="text-blocked">{error}</p> : null}
            <Button data-testid="login" type="submit" disabled={busy || username.length < 3 || password.length < 8}>
              {busy ? t('signingIn') : t('signIn')}
            </Button>
          </form>
        </Panel>
      </div>
    </main>
  )
}
