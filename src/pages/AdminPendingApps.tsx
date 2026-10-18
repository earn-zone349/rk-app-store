import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchPendingApps, type AdminAppRow } from '@/services/admin'

export default function AdminPendingApps() {
  const [apps, setApps] = useState<AdminAppRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPendingApps().then((rows) => {
      setApps(rows)
      setLoading(false)
    })
  }, [])

  if (loading) return <p className="text-sm text-ink/50">লোড হচ্ছে…</p>

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">পর্যালোচনার অপেক্ষায়</h1>
      <p className="mb-6 text-sm text-ink/50">সবচেয়ে পুরনো submission আগে — কোনোটা যেন ভুলে না যায়।</p>

      {apps.length === 0 ? (
        <p className="rounded-card border border-ink/10 bg-ink/[0.02] p-6 text-center text-sm text-ink/50">
          এই মুহূর্তে পর্যালোচনার অপেক্ষায় কিছু নেই — সব clear! 🎉
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {apps.map((app) => (
            <Link
              key={app.id}
              to={`/admin/apps/${app.id}`}
              className="flex items-center gap-3 rounded-card border border-ink/10 bg-white p-3 hover:border-brand-300"
            >
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-card bg-ink/5">
                {app.iconUrl && <img src={app.iconUrl} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{app.name}</p>
                <p className="truncate text-xs text-ink/50">
                  {app.developer.developerName}
                  {app.developer.verified && ' ✓'} · {new Date(app.createdAt).toLocaleDateString('bn-BD')}
                </p>
              </div>
              <span className="shrink-0 text-sm text-brand-600">পর্যালোচনা করো →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
