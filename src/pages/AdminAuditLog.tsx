import { useEffect, useState } from 'react'
import { fetchAuditLog, type AuditLogEntry } from '@/services/admin'

const ACTION_LABEL: Record<string, { text: string; className: string }> = {
  approve: { text: 'Approve', className: 'bg-signal-green/15 text-signal-green' },
  reject: { text: 'Reject', className: 'bg-signal-red/15 text-signal-red' },
  suspend: { text: 'Suspend', className: 'bg-signal-amber/15 text-signal-amber' },
  feature: { text: 'Feature', className: 'bg-brand-100 text-brand-700' },
  unfeature: { text: 'Unfeature', className: 'bg-ink/10 text-ink/60' },
  resolve: { text: 'Report Resolved', className: 'bg-signal-green/15 text-signal-green' },
  dismiss: { text: 'Report Dismissed', className: 'bg-ink/10 text-ink/60' },
  enroll_admin: { text: 'Admin যোগ', className: 'bg-brand-100 text-brand-700' },
}

/**
 * Phase 7's roadmap line item was "moderation reports" — but a
 * user-facing "report this app" feature didn't exist yet at the time
 * (that arrived in Phase 8). Building a UI for reports with no underlying
 * data would just have been an empty screen pretending to be a feature,
 * so this page was built as the audit log instead. Phase 8 has since
 * added the real thing — see AdminReports.tsx (/admin/reports) — this
 * page remains as the general "who did what" record across both apps and
 * reports.
 */
export default function AdminAuditLog() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAuditLog(200).then((rows) => {
      setEntries(rows)
      setLoading(false)
    })
  }, [])

  if (loading) return <p className="text-sm text-ink/50">লোড হচ্ছে…</p>

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Audit Log</h1>
      <p className="mb-6 text-sm text-ink/50">প্রতিটা admin action-এর রেকর্ড — কে, কী, কেন।</p>

      {entries.length === 0 ? (
        <p className="text-sm text-ink/50">এখনো কিছু নেই।</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-xs text-ink/40">
                <th className="py-2 pr-3">সময়</th>
                <th className="py-2 pr-3">Admin</th>
                <th className="py-2 pr-3">Action</th>
                <th className="py-2 pr-3">Target</th>
                <th className="py-2">কারণ</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const label = ACTION_LABEL[entry.action] ?? { text: entry.action, className: 'bg-ink/10 text-ink/60' }
                return (
                  <tr key={entry.id} className="border-b border-ink/5">
                    <td className="whitespace-nowrap py-2 pr-3 text-xs text-ink/50">
                      {new Date(entry.createdAt).toLocaleString('bn-BD')}
                    </td>
                    <td className="py-2 pr-3">{entry.adminLabel ?? '—'}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${label.className}`}>
                        {label.text}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-ink/50">
                      {entry.targetType}:{entry.targetId.slice(0, 8)}
                    </td>
                    <td className="py-2 text-ink/70">{entry.reason ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
