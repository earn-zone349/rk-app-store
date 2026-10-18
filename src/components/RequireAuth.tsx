import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

/**
 * Wrap any route element that should only be reachable while logged in.
 * Used from Phase 4 onward for the developer dashboard, and from Phase 7
 * for the admin panel (paired with an additional admin-role check there).
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <p className="text-sm text-ink/50">লোড হচ্ছে…</p>
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return <>{children}</>
}
