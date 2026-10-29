import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { AuthProvider } from './auth'
import { LocaleProvider } from './i18n'
import '@fontsource/cairo/400.css'
import '@fontsource/cairo/700.css'
import './index.css'

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    const sync = registration as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }
    void sync?.sync?.register('hdp-scans').catch(() => undefined)
  },
})

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'FLUSH_SCANS') window.dispatchEvent(new Event('hdp-sync'))
  })
  window.addEventListener('online', () => {
    void navigator.serviceWorker.ready.then((registration) => {
      registration.active?.postMessage({ type: 'FLUSH_SCANS' })
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </LocaleProvider>
  </StrictMode>,
)
