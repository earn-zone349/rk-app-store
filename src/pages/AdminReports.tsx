import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchReports,
  resolveReport,
  fetchDmcaReports,
  resolveDmcaReport,
  type AdminReportRow,
  type ReportAction,
  type AdminDmcaRow,
} from '@/services/admin'

export default function AdminReports() {
  const [reports, setReports] = useState<AdminReportRow[]>([])
  const [dmcaReports, setDmcaReports] = useState<AdminDmcaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  function load() {
    setLoading(true)
    Promise.all([fetchReports('open'), fetchDmcaReports()]).then(([rows, dmcaRows]) => {
      setReports(rows)
      setDmcaReports(dmcaRows)
      setLoading(false)
    })
  }

  useEffect(load, [])

  async function handleResolve(reportId: string, action: ReportAction) {
    setBusyId(reportId)
    const result = await resolveReport(reportId, action)
    if (result.ok) {
      setReports((prev) => prev.filter((r) => r.id !== reportId))
    }
    setBusyId(null)
  }

  async function handleResolveDmca(dmcaId: string, action: 'resolve' | 'dismiss') {
    setBusyId(dmcaId)
    const result = await resolveDmcaReport(dmcaId, action)
    if (result.ok) {
      setDmcaReports((prev) => prev.filter((r) => r.id !== dmcaId))
    }
    setBusyId(null)
  }

  if (loading) return <p className="text-sm text-ink/50">লোড হচ্ছে…</p>

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Reports</h1>
      <p className="mb-6 text-sm text-ink/50">ব্যবহারকারীরা যেসব app নিয়ে অভিযোগ করেছে।</p>

      {reports.length === 0 ? (
        <p className="rounded-card border border-ink/10 bg-ink/[0.02] p-6 text-center text-sm text-ink/50">
          খোলা কোনো report নেই — সব clear! 🎉
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {reports.map((report) => (
            <div key={report.id} className="rounded-card border border-ink/10 bg-white p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <Link to={`/app/${report.appSlug}`} target="_blank" className="font-medium text-brand-600 underline">
                    {report.appName}
                  </Link>
                  <p className="text-xs text-ink/40">
                    {report.reporterLabel} · {new Date(report.createdAt).toLocaleString('bn-BD')}
                  </p>
                </div>
              </div>
              <p className="mb-3 text-sm">{report.reason}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busyId === report.id}
                  onClick={() => handleResolve(report.id, 'resolve')}
                  className="rounded-card bg-signal-green px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  Resolved হিসেবে চিহ্নিত করো
                </button>
                <button
                  type="button"
                  disabled={busyId === report.id}
                  onClick={() => handleResolve(report.id, 'dismiss')}
                  className="rounded-card border border-ink/15 px-3 py-1.5 text-xs font-medium text-ink/70 disabled:opacity-50"
                >
                  Dismiss করো
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-1 mt-10 text-lg font-semibold">DMCA / Copyright Claims</h2>
      <p className="mb-6 text-sm text-ink/50">Formal copyright takedown submissions (public form at /dmca)।</p>

      {dmcaReports.length === 0 ? (
        <p className="rounded-card border border-ink/10 bg-ink/[0.02] p-6 text-center text-sm text-ink/50">
          খোলা কোনো DMCA claim নেই।
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {dmcaReports.map((claim) => (
            <div key={claim.id} className="rounded-card border border-ink/10 bg-white p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <Link to={`/app/${claim.appSlug}`} target="_blank" className="font-medium text-brand-600 underline">
                    {claim.appName}
                  </Link>
                  <p className="text-xs text-ink/40">
                    {claim.claimantName} ({claim.claimantEmail}) ·{' '}
                    {new Date(claim.createdAt).toLocaleString('bn-BD')}
                  </p>
                </div>
              </div>
              <p className="mb-1 text-sm">
                <span className="font-medium">Copyrighted work:</span> {claim.copyrightedWork}
              </p>
              <p className="mb-3 text-sm">{claim.infringementDescription}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busyId === claim.id}
                  onClick={() => handleResolveDmca(claim.id, 'resolve')}
                  className="rounded-card bg-signal-green px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  Resolved (app-এ ব্যবস্থা নেওয়া হয়েছে)
                </button>
                <button
                  type="button"
                  disabled={busyId === claim.id}
                  onClick={() => handleResolveDmca(claim.id, 'dismiss')}
                  className="rounded-card border border-ink/15 px-3 py-1.5 text-xs font-medium text-ink/70 disabled:opacity-50"
                >
                  Dismiss করো
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
