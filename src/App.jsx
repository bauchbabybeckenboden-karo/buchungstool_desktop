import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Admin from './pages/Admin.jsx'
import Booking from './pages/Booking.jsx'
import Login from './pages/Login.jsx'
import { supabase } from './supabase.js'

function AdminGate() {
  const [session, setSession] = useState(undefined) // undefined = wird geladen

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (session === undefined) return null // kurzer Ladezustand
  if (!session) return <Login />
  return <Admin />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="/admin" element={<AdminGate />} />
      {/* Wird pro Website-Seite eingebettet, z.B. /kurse/mamafit fuer bauch-baby-beckenboden.de/mamafit/ */}
      <Route path="/kurse/:courseTypeSlug" element={<Booking />} />
    </Routes>
  )
}
