import { useEffect, useState } from 'react'
import {
  fetchDevelopersForAdmin,
  getIdDocumentSignedUrl,
  toggleDeveloperVerified,
  type AdminDeveloperRow,
} from '@/services/admin'

export default function AdminDevelopers() {
  const [developers, setDevelopers] = useState<AdminDeveloperRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [docUrls, setDocUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchDevelopersForAdmin().then((rows) => {
      setDevelopers(rows)
      setLoading(false)
    })
  }, [])

  async function handleViewDocument(developerId: string, path: string) {
    const url = await getIdDocumentSignedUrl(path)
    if (url) setDocUrls((prev) => ({ ...prev, [developerId]: url }))
  }

  async function handleToggleVerified(developerId: string, verify: boolean) {
    setBusyId(developerId)
    try {
      const result = await toggleDeveloperVerified(developerId, verify)
      if (result.ok) {
        setDevelopers((prev) => prev.map((d) => (d.id === developerId ? { ...d, verified: verify } : d)))
      }
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <p className="text-sm text-ink/50">লোড হচ্ছে…</p>

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Developers</h1>
      <p className="mb-6 text-sm text-ink/50">
        ID document আপলোড করা developer-দের ভেরিফাই করো, বা যে কাউকে verified badge দাও/সরাও।
      </p>

      <div className="flex flex-col gap-3">
        {developers.map((dev) => (
          <div key={dev.id} className="rounded-card border border-ink/10 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {dev.developerName} {dev.verified && <span className="text-signal-green">✓ verified</span>}
                </p>
                <p className="text-xs text-ink/50">
                  {dev.supportEmail ?? '—'} · {dev.phone ?? '—'} · যোগ দিয়েছে{' '}
                  {new Date(dev.createdAt).toLocaleDateString('bn-BD')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleVerified(dev.id, !dev.verified)}
                disabled={busyId === dev.id}
                className={`shrink-0 rounded-card px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
                  dev.verified
                    ? 'border border-ink/15 text-ink/70'
                    : 'bg-signal-green text-white hover:bg-signal-green/90'
                }`}
              >
                {busyId === dev.id ? '...' : dev.verified ? 'Verified badge সরাও' : 'Verify করো'}
              </button>
            </div>

            {dev.idDocumentPath ? (
              <div className="mt-3 border-t border-ink/5 pt-3">
                <p className="mb-1 text-xs text-ink/50">
                  ID document আপলোড হয়েছে{' '}
                  {dev.idDocumentUploadedAt && new Date(dev.idDocumentUploadedAt).toLocaleDateString('bn-BD')}
                </p>
                {docUrls[dev.id] ? (
                  <a href={docUrls[dev.id]} target="_blank" rel="noreferrer" className="text-sm text-brand-600 underline">
                    Document খোলো (link ১০ মিনিট সচল থাকবে) →
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleViewDocument(dev.id, dev.idDocumentPath!)}
                    className="text-sm text-brand-600 underline"
                  >
                    Document দেখো
                  </button>
                )}
              </div>
            ) : (
              <p className="mt-3 border-t border-ink/5 pt-3 text-xs text-ink/40">কোনো ID document আপলোড করেনি।</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
