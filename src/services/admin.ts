import { supabase } from '@/lib/supabaseClient'
import { mapAppRow, mapVersionRow, type AppRow } from '@/services/appsDev'
import type { AppListing, AppStatus, Developer } from '@/types'

// ---------------------------------------------------------------------------
// TOTP login gate (see admin-verify-totp/index.ts for what this does and
// doesn't protect against — worth reading before assuming this alone is
// "the" security boundary).
// ---------------------------------------------------------------------------

export async function verifyAdminTotp(code: string): Promise<{ verified: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke<{ verified: boolean; error?: string }>(
    'admin-verify-totp',
    { body: { code } },
  )
  if (error) return { verified: false, error: 'Verify করা যায়নি — একটু পরে আবার চেষ্টা করো।' }
  return data ?? { verified: false, error: 'কোনো উত্তর পাওয়া যায়নি।' }
}

/**
 * Confirms admin status straight from the database (admins table, RLS:
 * "admins can see their own row") rather than trusting the sessionStorage
 * flag alone — used by RequireAdmin.tsx on every admin route so a
 * logged-out-then-different-account-logged-in-again case can't ride on a
 * stale flag left over in sessionStorage from a previous session.
 */
export async function checkIsAdmin(): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false

  const { data, error } = await supabase.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  return !error && Boolean(data)
}

// ---------------------------------------------------------------------------
// App queue
// ---------------------------------------------------------------------------

export interface AdminAppRow extends AppListing {
  developer: Developer
}

interface AdminAppQueryRow extends AppRow {
  developers: {
    id: string
    developer_name: string
    logo_url: string | null
    verified: boolean
    support_email: string | null
    user_id: string
  }
}

function mapAdminAppRow(row: AdminAppQueryRow): AdminAppRow {
  const app = mapAppRow(row)
  return {
    ...app,
    developer: {
      id: row.developers.id,
      userId: row.developers.user_id,
      developerName: row.developers.developer_name,
      logoUrl: row.developers.logo_url ?? undefined,
      supportEmail: row.developers.support_email ?? undefined,
      verified: row.developers.verified,
      // isOwner/paymentStatus/createdAt aren't needed for the review
      // screen and weren't selected — see the `developers(...)` column
      // list in the queries below if a future screen needs them too.
      isOwner: false,
      paymentStatus: 'unpaid',
      createdAt: '',
    },
  }
}

const ADMIN_APP_SELECT =
  '*, developers(id, developer_name, logo_url, verified, support_email, user_id), screenshots(url, position)'

/** The review queue — oldest submissions first, so nothing sits forgotten. */
export async function fetchPendingApps(): Promise<AdminAppRow[]> {
  const { data, error } = await supabase
    .from('apps')
    .select(ADMIN_APP_SELECT)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => mapAdminAppRow(row as unknown as AdminAppQueryRow))
}

/** Every app regardless of status — for finding an already-approved app to suspend, for example. */
export async function fetchAllAppsForAdmin(statusFilter?: AppStatus): Promise<AdminAppRow[]> {
  let query = supabase.from('apps').select(ADMIN_APP_SELECT).order('updated_at', { ascending: false })
  if (statusFilter) query = query.eq('status', statusFilter)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => mapAdminAppRow(row as unknown as AdminAppQueryRow))
}

export async function fetchAppForReview(appId: string) {
  const { data: appRow, error: appError } = await supabase
    .from('apps')
    .select(ADMIN_APP_SELECT)
    .eq('id', appId)
    .single()
  if (appError) throw appError

  const { data: versionRows, error: versionError } = await supabase
    .from('app_versions')
    .select('*')
    .eq('app_id', appId)
    .order('version_code', { ascending: false })
  if (versionError) throw versionError

  return {
    app: mapAdminAppRow(appRow as unknown as AdminAppQueryRow),
    versions: (versionRows ?? []).map(mapVersionRow),
  }
}

// ---------------------------------------------------------------------------
// Actions — every one of these goes through the admin-action Edge
// Function (service_role on the server side; see that function for why
// direct client-side updates to apps.status don't work at all, on
// purpose — protect_apps_admin_columns() silently no-ops them).
// ---------------------------------------------------------------------------

export type AdminAction = 'approve' | 'reject' | 'suspend' | 'feature' | 'unfeature'
export type ReportAction = 'resolve' | 'dismiss'

export async function performAdminAction(
  appId: string,
  action: AdminAction,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string }>('admin-action', {
    body: { targetId: appId, targetType: 'app', action, reason },
  })
  if (error) return { ok: false, error: 'Action পাঠানো যায়নি — একটু পরে আবার চেষ্টা করো।' }
  return data ?? { ok: false, error: 'কোনো উত্তর পাওয়া যায়নি।' }
}

// ---------------------------------------------------------------------------
// Reports (Phase 8) — the reader side. Resolving one goes through the same
// admin-action Edge Function as app moderation.
// ---------------------------------------------------------------------------

export interface AdminReportRow {
  id: string
  appId: string
  appName: string
  appSlug: string
  reporterLabel: string
  reason: string
  status: 'open' | 'reviewed' | 'dismissed'
  createdAt: string
}

export async function fetchReports(statusFilter: 'open' | 'all' = 'open'): Promise<AdminReportRow[]> {
  // apps(name, slug) is a safe embed — reports.app_id really does have a
  // direct FK to apps.id. profiles(display_name) would NOT be (see the
  // identical fix + explanation in community.ts's attachDisplayNames) —
  // reports.user_id and profiles.user_id both independently reference
  // auth.users, with no FK between reports and profiles directly, so it's
  // fetched as a separate lookup below instead of embedded here.
  let query = supabase
    .from('reports')
    .select('id, user_id, reason, status, created_at, apps(name, slug)')
    .order('created_at', { ascending: true })

  if (statusFilter === 'open') query = query.eq('status', 'open')

  const { data, error } = await query
  if (error) throw error
  const rows = data ?? []

  const reporterIds = [...new Set(rows.map((r) => r.user_id))]
  const { data: profileRows } = reporterIds.length
    ? await supabase.from('profiles').select('user_id, display_name').in('user_id', reporterIds)
    : { data: [] as { user_id: string; display_name: string }[] }
  const nameByUserId = new Map((profileRows ?? []).map((p) => [p.user_id, p.display_name]))

  return rows.map((row) => {
    const appRow = row.apps as unknown as { name?: string; slug?: string } | { name?: string; slug?: string }[] | null
    const app = Array.isArray(appRow) ? appRow[0] : appRow

    return {
      id: row.id,
      appId: '', // not selected — only needed if a future screen links straight to review; app.slug already covers navigation
      appName: app?.name ?? '(app পাওয়া যায়নি)',
      appSlug: app?.slug ?? '',
      reporterLabel: nameByUserId.get(row.user_id) ?? 'নাম-প্রকাশ-না-করা ব্যবহারকারী',
      reason: row.reason,
      status: row.status,
      createdAt: row.created_at,
    }
  })
}

export async function resolveReport(reportId: string, action: ReportAction): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string }>('admin-action', {
    body: { targetId: reportId, targetType: 'report', action },
  })
  if (error) return { ok: false, error: 'পাঠানো যায়নি — একটু পরে আবার চেষ্টা করো।' }
  return data ?? { ok: false, error: 'কোনো উত্তর পাওয়া যায়নি।' }
}

// ---------------------------------------------------------------------------
// #80 — DMCA/copyright takedown claims
// ---------------------------------------------------------------------------

export interface AdminDmcaRow {
  id: string
  appName: string
  appSlug: string
  claimantName: string
  claimantEmail: string
  copyrightedWork: string
  infringementDescription: string
  createdAt: string
}

export async function fetchDmcaReports(): Promise<AdminDmcaRow[]> {
  const { data, error } = await supabase
    .from('dmca_reports')
    .select('id, claimant_name, claimant_email, copyrighted_work, infringement_description, created_at, apps(name, slug)')
    .eq('status', 'open')
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => {
    const appRow = row.apps as unknown as { name?: string; slug?: string } | { name?: string; slug?: string }[] | null
    const app = Array.isArray(appRow) ? appRow[0] : appRow
    return {
      id: row.id,
      appName: app?.name ?? '(app পাওয়া যায়নি)',
      appSlug: app?.slug ?? '',
      claimantName: row.claimant_name,
      claimantEmail: row.claimant_email,
      copyrightedWork: row.copyrighted_work,
      infringementDescription: row.infringement_description,
      createdAt: row.created_at,
    }
  })
}

export async function resolveDmcaReport(
  dmcaId: string,
  action: 'resolve' | 'dismiss',
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string }>('admin-action', {
    body: { targetId: dmcaId, targetType: 'dmca', action },
  })
  if (error) return { ok: false, error: 'পাঠানো যায়নি — একটু পরে আবার চেষ্টা করো।' }
  return data ?? { ok: false, error: 'কোনো উত্তর পাওয়া যায়নি।' }
}

// ---------------------------------------------------------------------------
// #73 — analytics
// ---------------------------------------------------------------------------

export interface AnalyticsSummary {
  viewsLast7Days: number
  viewsLast30Days: number
  topPaths: { path: string; count: number }[]
}

export async function fetchAnalyticsSummary(): Promise<AnalyticsSummary> {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // BUG FIX: this used to `select('path')` every row from the last 30
  // days and count/group them in JS — PostgREST caps a single select at
  // 1000 rows by default, so both numbers below would have silently gone
  // wrong past that much traffic instead of erroring. Both counts now use
  // count:'exact', head:true (accurate regardless of row count, and no
  // rows are actually transferred), and the grouping happens in SQL via
  // top_page_paths() (0012_analytics.sql) instead of in the browser.
  const [last7, last30, topPathsResult] = await Promise.all([
    supabase.from('page_views').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
    supabase.from('page_views').select('id', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo),
    supabase.rpc('top_page_paths', { days_back: 30, result_limit: 10 }),
  ])

  return {
    viewsLast7Days: last7.count ?? 0,
    viewsLast30Days: last30.count ?? 0,
    topPaths: (topPathsResult.data ?? []).map((row: { path: string; view_count: number }) => ({
      path: row.path,
      count: row.view_count,
    })),
  }
}

// ---------------------------------------------------------------------------
// #89 — support tickets (admin side)
// ---------------------------------------------------------------------------

export interface AdminTicketRow {
  id: string
  userEmail: string
  subject: string
  status: 'open' | 'in_progress' | 'resolved'
  createdAt: string
  updatedAt: string
}

export async function fetchAllTickets(): Promise<AdminTicketRow[]> {
  // RLS ("admins can read all tickets") already scopes this correctly —
  // no .eq() filter needed, same pattern as fetchAllAppsForAdmin().
  const { data, error } = await supabase
    .from('support_tickets')
    .select('id, subject, status, created_at, updated_at, user_id')
    .order('updated_at', { ascending: false })

  if (error) throw error
  const rows = data ?? []

  // auth.users isn't queryable from the client at all (no RLS-exposed
  // table for it) — email is fetched via the admin-only get-user-emails
  // Edge Function instead, same reasoning as admin-enroll needing
  // auth.admin.listUsers() server-side.
  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const { data: emailData } = await supabase.functions.invoke<{ emails: Record<string, string> }>(
    'admin-lookup-emails',
    { body: { userIds } },
  )
  const emailByUserId = emailData?.emails ?? {}

  return rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userEmail: emailByUserId[row.user_id] ?? row.user_id.slice(0, 8),
  }))
}

export async function replyToTicketAsAdmin(ticketId: string, message: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('লগইন করা নেই।')

  const { error } = await supabase
    .from('support_ticket_replies')
    .insert({ ticket_id: ticketId, sender_type: 'admin', admin_id: user.id, message })
  if (error) throw error

  // Fire-and-forget push notification — see notifyTicketActivity in
  // support.ts for the identical reasoning (in-app 🔔 bell already fires
  // via a DB trigger regardless; this is just the OS-level push on top).
  supabase.functions.invoke('support-notify', { body: { ticketId } }).catch(() => {})

  // Replying implicitly moves a fresh ticket out of "open" — an admin who
  // just answered shouldn't also have to remember a separate status click.
  await supabase.from('support_tickets').update({ status: 'in_progress' }).eq('id', ticketId)
}

export async function updateTicketStatus(
  ticketId: string,
  status: AdminTicketRow['status'],
): Promise<void> {
  const { error } = await supabase.from('support_tickets').update({ status }).eq('id', ticketId)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// #88 — budget projection, computed from real usage each time it's
// viewed (not a one-time written estimate that goes stale as the store
// grows) — see MONITORING_SETUP.md / this function's comments for the
// pricing assumptions baked in below.
// ---------------------------------------------------------------------------

export interface BudgetProjection {
  totalApkStorageGB: number
  r2FreeQuotaGB: number
  estimatedR2MonthlyCostUsd: number
  totalApps: number
  totalDevelopers: number
}

const R2_FREE_GB = 10
const R2_PRICE_PER_GB_USD = 0.015 // Cloudflare R2 Standard storage, per GB-month, beyond the free 10GB (see R2_SETUP.md)

export async function fetchBudgetProjection(): Promise<BudgetProjection> {
  const [storageBytesResult, appsCount, developersCount] = await Promise.all([
    supabase.rpc('total_apk_storage_bytes'),
    supabase.from('apps').select('id', { count: 'exact', head: true }),
    supabase.from('developers').select('id', { count: 'exact', head: true }),
  ])

  const totalBytes = Number(storageBytesResult.data ?? 0)
  const totalGB = totalBytes / 1024 ** 3
  const billableGB = Math.max(0, totalGB - R2_FREE_GB)

  return {
    totalApkStorageGB: totalGB,
    r2FreeQuotaGB: R2_FREE_GB,
    estimatedR2MonthlyCostUsd: billableGB * R2_PRICE_PER_GB_USD,
    totalApps: appsCount.count ?? 0,
    totalDevelopers: developersCount.count ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Developers (#28 verified toggle, #29 ID document review)
// ---------------------------------------------------------------------------

export interface AdminDeveloperRow {
  id: string
  developerName: string
  supportEmail: string | null
  phone: string | null
  verified: boolean
  idDocumentPath: string | null
  idDocumentUploadedAt: string | null
  createdAt: string
}

export async function fetchDevelopersForAdmin(): Promise<AdminDeveloperRow[]> {
  const { data, error } = await supabase
    .from('developers')
    .select('id, developer_name, support_email, phone, verified, id_document_path, id_document_uploaded_at, created_at')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    developerName: row.developer_name,
    supportEmail: row.support_email,
    phone: row.phone,
    verified: row.verified,
    idDocumentPath: row.id_document_path,
    idDocumentUploadedAt: row.id_document_uploaded_at,
    createdAt: row.created_at,
  }))
}

/**
 * developer-ids is a private bucket — admins can SELECT from it directly
 * (RLS policy in 0011_phase_gaps.sql), but the object itself still needs a
 * signed URL to actually be viewable in an <img>/<a> tag. Short-lived (10
 * minutes) since this is someone's ID document.
 */
export async function getIdDocumentSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('developer-ids').createSignedUrl(path, 600)
  if (error) return null
  return data.signedUrl
}

export async function toggleDeveloperVerified(
  developerId: string,
  verify: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string }>('admin-action', {
    body: { targetId: developerId, targetType: 'developer', action: verify ? 'verify' : 'unverify' },
  })
  if (error) return { ok: false, error: 'পাঠানো যায়নি — একটু পরে আবার চেষ্টা করো।' }
  return data ?? { ok: false, error: 'কোনো উত্তর পাওয়া যায়নি।' }
}

// ---------------------------------------------------------------------------
// #39 — revenue dashboard
// ---------------------------------------------------------------------------

export interface RevenueStats {
  totalRevenue: number
  successfulPayments: number
  failedPayments: number
  pendingPayments: number
}

export async function fetchRevenueStats(): Promise<RevenueStats> {
  const { data, error } = await supabase.from('payments').select('amount, status')
  if (error) throw error

  const rows = data ?? []
  return {
    totalRevenue: rows.filter((r) => r.status === 'success').reduce((sum, r) => sum + Number(r.amount), 0),
    successfulPayments: rows.filter((r) => r.status === 'success').length,
    failedPayments: rows.filter((r) => r.status === 'failed').length,
    pendingPayments: rows.filter((r) => r.status === 'pending').length,
  }
}

// ---------------------------------------------------------------------------
// Audit log + dashboard stats
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id: string
  adminLabel: string | null
  action: string
  targetType: string
  targetId: string
  reason: string | null
  createdAt: string
}

export async function fetchAuditLog(limit = 100): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, action, target_type, target_id, reason, created_at, admins(label)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []).map((row) => {
    const adminRow = row.admins as unknown as { label?: string } | { label?: string }[] | null
    const adminLabel = Array.isArray(adminRow) ? adminRow[0]?.label : adminRow?.label
    return {
      id: row.id,
      adminLabel: adminLabel ?? null,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      reason: row.reason,
      createdAt: row.created_at,
    }
  })
}

export interface AdminStats {
  pending: number
  approved: number
  rejected: number
  suspended: number
  totalDevelopers: number
  openReports: number
}

export async function fetchAdminStats(): Promise<AdminStats> {
  // count: 'exact', head: true — asks Postgres for just the row count, no
  // rows transferred, one round trip per number instead of downloading
  // every app row to count them in JS.
  const [pending, approved, rejected, suspended, developers, openReports] = await Promise.all([
    supabase.from('apps').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('apps').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('apps').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
    supabase.from('apps').select('id', { count: 'exact', head: true }).eq('status', 'suspended'),
    supabase.from('developers').select('id', { count: 'exact', head: true }),
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ])

  return {
    pending: pending.count ?? 0,
    approved: approved.count ?? 0,
    rejected: rejected.count ?? 0,
    suspended: suspended.count ?? 0,
    totalDevelopers: developers.count ?? 0,
    openReports: openReports.count ?? 0,
  }
}
