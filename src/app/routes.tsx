import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from '@/screens/Dashboard'
import Reports from '@/screens/Reports'
import ForecastFlows from '@/screens/ForecastFlows'
import ForecastView from '@/screens/ForecastView'
import Invoices from '@/screens/Invoices'
import RegularInvoices from '@/screens/RegularInvoices'
import OwnerOccupancy from '@/screens/OwnerOccupancy'
import Properties from '@/screens/Properties'
import Contacts from '@/screens/Contacts'
import Admin from '@/screens/Admin'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/forecast" element={<ForecastFlows />} />
      <Route path="/forecast/flows" element={<ForecastFlows />} />
      <Route path="/forecast/view" element={<ForecastView />} />
      <Route path="/invoices" element={<Invoices />} />
      <Route path="/invoices/regular" element={<RegularInvoices />} />
      <Route path="/invoices/owner-occupancy" element={<OwnerOccupancy />} />
      <Route path="/properties" element={<Properties />} />
      <Route path="/contacts" element={<Contacts />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
