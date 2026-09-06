import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Spinner } from '@fluentui/react-components'

const Dashboard        = lazy(() => import('@/screens/Dashboard'))
const Reports          = lazy(() => import('@/screens/Reports'))
const ForecastFlows     = lazy(() => import('@/screens/ForecastFlows'))
const ForecastView      = lazy(() => import('@/screens/ForecastView'))
const Invoices           = lazy(() => import('@/screens/Invoices'))
const RegularInvoices    = lazy(() => import('@/screens/RegularInvoices'))
const OwnerOccupancy     = lazy(() => import('@/screens/OwnerOccupancy'))
const ClientOccupancy    = lazy(() => import('@/screens/ClientOccupancy'))
const Properties         = lazy(() => import('@/screens/Properties'))
const Contacts           = lazy(() => import('@/screens/Contacts'))
const Admin              = lazy(() => import('@/screens/Admin'))

function RouteFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
      <Spinner label="Loading…" />
    </div>
  )
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/forecast" element={<ForecastFlows />} />
        <Route path="/forecast/flows" element={<ForecastFlows />} />
        <Route path="/forecast/view" element={<ForecastView />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/invoices/regular" element={<RegularInvoices />} />
        <Route path="/invoices/owner-occupancy" element={<OwnerOccupancy />} />
        <Route path="/invoices/client-occupancy" element={<ClientOccupancy />} />
        <Route path="/properties" element={<Properties />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
