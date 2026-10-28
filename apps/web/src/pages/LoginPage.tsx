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
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-paper px-4 py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(21,116,132,0.18),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(10,53,64,0.12),_transparent_50%)]" />
      <div className="relative w-full max-w-md">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex rounded-2xl bg-white p-3 shadow-[var(--shadow-card)]">
              <BrandLogos className="h-12" />
            </div>
            <h1 className="mt-4 text-2xl font-bold leading-snug tracking-tight text-ink sm:text-3xl">{t('appName')}</h1>
            <p className="mt-1 text-sm text-muted">{t('appPlace')}</p>
            <p className="mt-2 text-sm font-semibold text-teal">{t('loginTagline')}</p>
          </div>
          <button
            className="min-h-11 rounded-full border border-line bg-white px-4 text-sm font-bold shadow-sm"
            onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}
          >
            {locale === 'en' ? 'عربي' : 'EN'}
          </button>
        </div>
        <Panel className="shadow-[var(--shadow-lift)]">
          <form className="grid gap-4" onSubmit={onSubmit}>
            <Field label={t('username')}>
              <TextInput
                data-testid="username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoFocus
              />
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
            {error ? <p className="rounded-xl bg-blocked/10 px-3 py-2 text-sm font-semibold text-blocked">{error}</p> : null}
            <Button data-testid="login" type="submit" size="lg" disabled={busy || username.length < 3 || password.length < 8}>
              {busy ? t('signingIn') : t('signIn')}
            </Button>
          </form>
        </Panel>
        <p className="mt-4 text-center text-xs text-muted">{t('oneMeal')}</p>
      </div>
    </main>
  )
}
