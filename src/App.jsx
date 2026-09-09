import { Routes, Route, Navigate } from 'react-router-dom'
import Admin from './pages/Admin.jsx'
import Booking from './pages/Booking.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="/admin" element={<Admin />} />
      {/* Wird pro Website-Seite eingebettet, z.B. /kurse/mamafit fuer bauch-baby-beckenboden.de/mamafit/ */}
      <Route path="/kurse/:courseTypeSlug" element={<Booking />} />
    </Routes>
  )
}
