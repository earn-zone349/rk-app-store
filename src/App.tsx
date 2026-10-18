import { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import MainLayout from '@/layouts/MainLayout'
import AdminLayout from '@/layouts/AdminLayout'
import Home from '@/pages/Home'
import Search from '@/pages/Search'
import Categories from '@/pages/Categories'
import AppDetails from '@/pages/AppDetails'
import Placeholder from '@/pages/Placeholder'
import Login from '@/pages/Login'
import Signup from '@/pages/Signup'
import ForgotPassword from '@/pages/ForgotPassword'
import ResetPassword from '@/pages/ResetPassword'
import PrivacyPolicy from '@/pages/PrivacyPolicy'
import TermsOfService from '@/pages/TermsOfService'
import DeveloperTerms from '@/pages/DeveloperTerms'
import Contact from '@/pages/Contact'
import Dmca from '@/pages/Dmca'
import DeveloperGuide from '@/pages/DeveloperGuide'
import RequireAuth from '@/components/RequireAuth'
import RequireAdmin from '@/components/RequireAdmin'

// #71 — performance: everything below this line is behind a login (developer
// tools) or a login+TOTP (admin panel) — the vast majority of visitors, who
// are just browsing/downloading apps, never touch any of it. Code-splitting
// these into separate chunks means that majority never downloads this code
// at all, instead of it bloating the one main bundle everyone pays for on
// first load. PageFallback below covers the brief gap while a chunk loads.
const DeveloperOnboarding = lazy(() => import('@/pages/DeveloperOnboarding'))
const DeveloperDashboard = lazy(() => import('@/pages/DeveloperDashboard'))
const AddApp = lazy(() => import('@/pages/AddApp'))
const AddAppVersion = lazy(() => import('@/pages/AddAppVersion'))
const Favorites = lazy(() => import('@/pages/Favorites'))
const AccountSettings = lazy(() => import('@/pages/AccountSettings'))
const Support = lazy(() => import('@/pages/Support'))
const Receipt = lazy(() => import('@/pages/Receipt'))
const AdminLogin = lazy(() => import('@/pages/AdminLogin'))
const AdminDashboard = lazy(() => import('@/pages/AdminDashboard'))
const AdminPendingApps = lazy(() => import('@/pages/AdminPendingApps'))
const AdminAppReview = lazy(() => import('@/pages/AdminAppReview'))
const AdminAuditLog = lazy(() => import('@/pages/AdminAuditLog'))
const AdminReports = lazy(() => import('@/pages/AdminReports'))
const AdminDevelopers = lazy(() => import('@/pages/AdminDevelopers'))
const AdminBudget = lazy(() => import('@/pages/AdminBudget'))
const AdminSupport = lazy(() => import('@/pages/AdminSupport'))

function PageFallback() {
  return <p className="p-6 text-center text-sm text-ink/40">লোড হচ্ছে…</p>
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<Search />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/categories/:slug" element={<Categories />} />
        <Route path="/app/:slug" element={<AppDetails />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Phase 4 — developer system (all require login) */}
        <Route
          path="/developer"
          element={
            <RequireAuth>
              <DeveloperDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/developer/onboarding"
          element={
            <RequireAuth>
              <DeveloperOnboarding />
            </RequireAuth>
          }
        />
        <Route
          path="/developer/apps/new"
          element={
            <RequireAuth>
              <AddApp />
            </RequireAuth>
          }
        />
        <Route
          path="/developer/apps/:appId/versions/new"
          element={
            <RequireAuth>
              <AddAppVersion />
            </RequireAuth>
          }
        />

        {/* Phase 8 — community */}
        <Route
          path="/favorites"
          element={
            <RequireAuth>
              <Favorites />
            </RequireAuth>
          }
        />
        <Route
          path="/account"
          element={
            <RequireAuth>
              <AccountSettings />
            </RequireAuth>
          }
        />
        <Route
          path="/support"
          element={
            <RequireAuth>
              <Support />
            </RequireAuth>
          }
        />
        <Route
          path="/developer/receipt"
          element={
            <RequireAuth>
              <Receipt />
            </RequireAuth>
          }
        />

        {/* Phase 7 — admin panel. /admin/login is unguarded (that's the
            gate itself); everything else requires RequireAdmin, which
            checks both the DB admins table and this-session TOTP. */}
        <Route path="/admin/login" element={<AdminLogin />} />
      </Route>

      <Route element={<AdminLayout />}>
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminDashboard />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/apps"
          element={
            <RequireAdmin>
              <AdminPendingApps />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/apps/:appId"
          element={
            <RequireAdmin>
              <AdminAppReview />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <RequireAdmin>
              <AdminReports />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/developers"
          element={
            <RequireAdmin>
              <AdminDevelopers />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/budget"
          element={
            <RequireAdmin>
              <AdminBudget />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/support"
          element={
            <RequireAdmin>
              <AdminSupport />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/audit-log"
          element={
            <RequireAdmin>
              <AdminAuditLog />
            </RequireAdmin>
          }
        />
      </Route>

      <Route element={<MainLayout />}>
        {/* #75 — real content, not placeholders (see each file for the
            "have a lawyer review this" disclaimer on the two legal ones). */}
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/developer-terms" element={<DeveloperTerms />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/dmca" element={<Dmca />} />
        <Route path="/developer-guide" element={<DeveloperGuide />} />

        <Route path="*" element={<Placeholder title="404 — Page not found" />} />
      </Route>
      </Routes>
    </Suspense>
  )
}
