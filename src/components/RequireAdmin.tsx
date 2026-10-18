import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { checkIsAdmin } from '@/services/admin'

/**
 * Two checks, both required, for a different reason each:
 *   1. checkIsAdmin() — the DB truth (admins table, via RLS). This is
 *      what actually matters; sessionStorage is just a browser tab's
 *      memory of "did I pass TOTP a minute ago," not a security boundary
 *      on its own (real enforcement is server-side — see admin-action).
 *   2. The sessionStorage flag AdminLogin.tsx sets after a successful
 *      admin-verify-totp call — without this, being an admin in the
 *      database plus a valid Supabase session would be enough to reach
 *      these pages, skipping the TOTP step entirely.
 *
 * The sessionStorage flag is keyed by user id specifically so that
 * switching accounts in the same browser tab (sign out, sign in as
 * someone else) can't accidentally inherit a previous admin's verified
 * flag.
 */
export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth()
  const location = useLocation()
  const [checking, setChecking] = useState(true)
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!session) {
      setChecking(false)
      setAllowed(false)
      return
    }

    const totpFlag = sessionStorage.getItem('rk_admin_totp_verified')
    if (totpFlag !== session.user.id) {
      setChecking(false)
      setAllowed(false)
      return
    }

    checkIsAdmin().then((isAdmin) => {
      setAllowed(isAdmin)
      setChecking(false)
    })
  }, [session, authLoading])

  if (authLoading || checking) {
    return <p className="text-sm text-ink/50">যাচাই করা হচ্ছে…</p>
  }

  if (!allowed) {
    return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />
  }

  return <>{children}</>
}
