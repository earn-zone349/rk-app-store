import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchAdminStats,
  fetchAuditLog,
  fetchRevenueStats,
  fetchAnalyticsSummary,  
  type AdminStats,
  type AuditLogEntry,
  type RevenueStats,
  type AnalyticsSummary,
} from '@/services/admin'

const ACTION_LABEL: Record<string, string> = {
  approve: 'অনুমোদন করেছে',
  reject: 'প্রত্যাখ্যান করেছে',
  suspend: 'স্থগিত করেছে',
  feature: 'featured করেছে',
  unfeature: 'featured সরিয়েছে',
  enroll_admin: 'নতুন admin যোগ করেছে',
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [revenue, setRevenue] = useState<RevenueStats | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null)
  const [recentActivity, setRecentActivity] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchAdminStats(), fetchAuditLog(10), fetchRevenueStats(), fetchAnalyticsSummary()]).then(
      ([s, log, rev, an]) => {
        setStats(s)
        setRecentActivity(log)
        setRevenue(rev)
        setAnalytics(an)
        setLoading(false)
      },
    )
  }, [])

  if (loading) return <p className="text-sm text-ink/50">লোড হচ্ছে…</p>

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Admin Dashboard</h1>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-6">
        <StatCard label="পর্যালোচনার অপেক্ষায়" value={stats!.pending} highlight />
        <StatCard label="প্রকাশিত" value={stats!.approved} />
        <StatCard label="প্রত্যাখ্যাত" value={stats!.rejected} />
        <StatCard label="স্থগিত" value={stats!.suspended} />
        <StatCard label="খোলা Report" value={stats!.openReports} highlight />
        <StatCard label="মোট Developer" value={stats!.totalDevelopers} />
      </div>

      {stats!.pending > 0 && (
        <Link
          to="/admin/apps"
          className="mb-4 block rounded-card border border-signal-amber/30 bg-signal-amber/10 p-4 text-signal-amber"
        >
          <span className="font-medium">{stats!.pending}টা app পর্যালোচনার অপেক্ষায় আছে</span> — এখন দেখো →
        </Link>
      )}

      {stats!.openReports > 0 && (
        <Link
          to="/admin/reports"
          className="mb-8 block rounded-card border border-signal-red/30 bg-signal-red/10 p-4 text-signal-red"
        >
          <span className="font-medium">{stats!.openReports}টা report খোলা আছে</span> — এখন দেখো →
        </Link>
      )}

      {/* #39 — revenue dashboard */}
      {revenue && (
        <div className="mb-8 rounded-card border border-ink/10 bg-white p-4">
          <p className="mb-3 text-sm font-medium text-ink/70">Revenue</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-2xl font-semibold text-signal-green">৳{revenue.totalRevenue.toLocaleString('bn-BD')}</p>
              <p className="text-xs text-ink/50">মোট আয় (সফল payment)</p>
            </div>
            <div>
              <p className="text-2xl font-semibold">{revenue.successfulPayments}</p>
              <p className="text-xs text-ink/50">সফল payment</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-signal-red">{revenue.failedPayments}</p>
              <p className="text-xs text-ink/50">ব্যর্থ payment</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-signal-amber">{revenue.pendingPayments}</p>
              <p className="text-xs text-ink/50">pending payment</p>
            </div>
          </div>
        </div>
      )}

      {/* #73 — built-in analytics (no external service, no cookie banner) */}
      {analytics && (
        <div className="mb-8 rounded-card border border-ink/10 bg-white p-4">
          <p className="mb-3 text-sm font-medium text-ink/70">Traffic</p>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2">
            <div>
              <p className="text-2xl font-semibold">{analytics.viewsLast7Days}</p>
              <p className="text-xs text-ink/50">গত ৭ দিনে page view</p>
            </div>
            <div>
              <p className="text-2xl font-semibold">{analytics.viewsLast30Days}</p>
              <p className="text-xs text-ink/50">গত ৩০ দিনে page view</p>
            </div>
          </div>
          {analytics.topPaths.length > 0 && (
            <>
              <p className="mb-1 text-xs text-ink/50">সবচেয়ে বেশি দেখা পাতা (গত ৩০ দিন)</p>
              <div className="flex flex-col gap-1">
                {analytics.topPaths.map((p) => (
                  <div key={p.path} className="flex justify-between text-xs">
                    <span className="text-ink/70">{p.path}</span>
                    <span className="text-ink/40">{p.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <h2 className="mb-3 text-sm font-medium text-ink/70">সাম্প্রতিক কার্যক্রম</h2>
      {recentActivity.length === 0 ? (
        <p className="text-sm text-ink/50">এখনো কোনো admin action হয়নি।</p>
      ) : (
        <div className="flex flex-col gap-2">
          {recentActivity.map((entry) => (
            <div key={entry.id} className="rounded-card border border-ink/10 p-3 text-sm">
              <span className="font-medium">{entry.adminLabel ?? 'কেউ একজন'}</span>{' '}
              {ACTION_LABEL[entry.action] ?? entry.action}
              {entry.reason && <span className="text-ink/60"> — "{entry.reason}"</span>}
              <div className="mt-0.5 text-xs text-ink/40">{new Date(entry.createdAt).toLocaleString('bn-BD')}</div>
            </div>
          ))}
        </div>
      )}
      <Link to="/admin/audit-log" className="mt-3 inline-block text-sm text-brand-600 underline">
        সম্পূর্ণ audit log দেখো →
      </Link>
    </div>
  )
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={`rounded-card border p-3 ${highlight && value > 0 ? 'border-signal-amber/40 bg-signal-amber/5' : 'border-ink/10'}`}
    >
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-ink/50">{label}</p>
    </div>
  )
}
