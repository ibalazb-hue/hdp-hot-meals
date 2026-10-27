import type { ReactNode } from 'react'
import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom'
import type { Role } from '@hdp/rules'
import { useAuth } from './auth'
import { Shell } from './components/Shell'
import { useI18n } from './i18n'
import { AdminPage } from './pages/AdminPage'
import { CardsPage } from './pages/CardsPage'
import { DashboardPage } from './pages/DashboardPage'
import { ExportPage } from './pages/ExportPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { ManualPage } from './pages/ManualPage'
import { ReconcilePage } from './pages/ReconcilePage'
import { RegisterPage } from './pages/RegisterPage'
import { ScanPage } from './pages/ScanPage'
import { SopPage } from './pages/SopPage'

function Screen({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { session } = useAuth()
  if (roles && session && !roles.includes(session.user.role)) return <Navigate to="/" replace />
  return children
}

function Gate() {
  const { session, ready } = useAuth()
  const { t } = useI18n()
  if (!ready) return <p className="p-6">{t('loading')}</p>
  if (!session) return <Navigate to="/login" replace />
  return <Shell />
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Gate />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/scan" element={<Screen roles={['dp_focal', 'supervisor']}><ScanPage /></Screen>} />
          <Route path="/manual" element={<Screen roles={['dp_focal', 'supervisor']}><ManualPage /></Screen>} />
          <Route path="/register" element={<Screen roles={['meal', 'admin']}><RegisterPage /></Screen>} />
          <Route path="/cards" element={<Screen roles={['meal', 'admin', 'supervisor']}><CardsPage /></Screen>} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/reconcile" element={<Screen roles={['meal', 'supervisor', 'admin']}><ReconcilePage /></Screen>} />
          <Route path="/export" element={<Screen roles={['meal', 'supervisor', 'admin']}><ExportPage /></Screen>} />
          <Route path="/admin" element={<Screen roles={['admin']}><AdminPage /></Screen>} />
          <Route path="/sop" element={<SopPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
