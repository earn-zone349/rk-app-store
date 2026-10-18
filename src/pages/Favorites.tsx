import { useEffect, useState } from 'react'
import AppCard from '@/components/AppCard'
import { fetchMyFavoriteApps } from '@/services/community'
import type { AppListing } from '@/types'

export default function Favorites() {
  const [apps, setApps] = useState<AppListing[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMyFavoriteApps().then((rows) => {
      setApps(rows)
      setLoading(false)
    })
  }, [])

  if (loading) return <p className="text-sm text-ink/50">লোড হচ্ছে…</p>

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">তোমার Favorites</h1>
      {apps.length === 0 ? (
        <p className="rounded-card border border-ink/10 bg-ink/[0.02] p-6 text-center text-sm text-ink/50">
          এখনো কোনো app favorite করা হয়নি — কোনো app-এর পাতায় গিয়ে ★ বাটনে চাপ দাও।
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {apps.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </div>
  )
}
