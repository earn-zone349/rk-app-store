import { Link, NavLink, Outlet } from 'react-router-dom'
import { signOut } from '@/services/auth'

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/apps', label: 'App Review' },
  { to: '/admin/developers', label: 'Developers' },
  { to: '/admin/budget', label: 'Budget' },
  { to: '/admin/support', label: 'Support' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/audit-log', label: 'Audit Log' },
]

/**
 * Deliberately its own layout, not MainLayout — an admin reviewing apps
 * doesn't need the public storefront's search bar/category nav around
 * them, and keeping the two visually distinct is one more small signal
 * (alongside the separate /admin/login + TOTP gate) that this isn't just
 * another public page.
 */
export default function AdminLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-ink/[0.02]">
      <header className="border-b border-ink/10 bg-ink text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
          <Link to="/admin" className="font-semibold">
            RK App Store · Admin
          </Link>
          <nav className="flex gap-4 text-sm">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => (isActive ? 'text-white' : 'text-white/60 hover:text-white')}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => signOut().then(() => (window.location.href = '/admin/login'))}
            className="ml-auto text-sm text-white/60 hover:text-white"
          >
            লগআউট
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
