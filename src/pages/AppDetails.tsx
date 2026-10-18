import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchAppBySlug } from '@/services/apps'
import { trackDownload } from '@/services/community'
import { useLanguage } from '@/context/LanguageContext'
import { useDocumentMeta } from '@/hooks/useDocumentMeta'
import FavoriteButton from '@/components/FavoriteButton'
import ReviewSection from '@/components/ReviewSection'
import ReportButton from '@/components/ReportButton'
import ShareButton from '@/components/ShareButton'
import type { AppListing } from '@/types'

export default function AppDetails() {
  const { slug } = useParams<{ slug: string }>()
  const { t } = useLanguage()
  const [app, setApp] = useState<AppListing | null>(null)
  const [loading, setLoading] = useState(true)

  useDocumentMeta(app?.name ?? 'App', app?.shortDescription)

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    fetchAppBySlug(slug).then((result) => {
      setApp(result)
      setLoading(false)
    })
  }, [slug])

  if (loading) return <p className="text-sm text-ink/50">Loading…</p>
  if (!app) {
    return (
      <div>
        <p className="text-sm text-ink/60">This app doesn't exist or isn't published.</p>
        <Link to="/" className="text-brand-600 underline">
          Back to home
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {/* #70 — structured data so search results can show a rich card
          (rating stars, price) instead of a plain blue link. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: app.name,
            description: app.shortDescription,
            applicationCategory: 'MobileApplication',
            operatingSystem: 'ANDROID',
            aggregateRating:
              app.ratingCount > 0
                ? { '@type': 'AggregateRating', ratingValue: app.rating, ratingCount: app.ratingCount }
                : undefined,
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'BDT' },
          }),
        }}
      />
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-card bg-ink/5">
          <img src={app.iconUrl} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{app.name}</h1>
          <p className="text-sm text-ink/60">{app.shortDescription}</p>
          <p className="mt-1 flex items-center gap-3 text-sm text-ink/70">
            <span>⭐ {app.rating.toFixed(1)} ({app.ratingCount.toLocaleString()})</span>
            <span>📥 {app.downloadCount.toLocaleString()} downloads</span>
            <span className="rounded-full border border-ink/15 px-2 py-0.5 text-xs">{app.ageRating}</span>
          </p>
        </div>
        <a
          href={app.currentVersion?.apkUrl ?? '#'}
          className="inline-flex shrink-0 items-center justify-center rounded-card bg-brand-500 px-6 py-3 font-medium text-white hover:bg-brand-600"
          onClick={(e) => {
            if (!app.currentVersion?.apkUrl) {
              e.preventDefault()
              return
            }
            // Best-effort counter (see trackDownload/increment_download_count)
            // — fires alongside the actual download, never blocks it.
            trackDownload(app.id)
          }}
        >
          {t('action.download')}
        </a>
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <FavoriteButton appId={app.id} />
      </section>

      {app.screenshots.length > 0 && (
        <section className="flex gap-3 overflow-x-auto">
          {app.screenshots.map((src, i) => (
            <img
              key={i}
              src={src}
              alt={`${app.name} screenshot ${i + 1}`}
              className="h-64 rounded-card border border-ink/10 object-cover"
            />
          ))}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-lg font-semibold">About this app</h2>
        <p className="whitespace-pre-line text-ink/80">{app.description}</p>
      </section>

      {app.currentVersion && (
        <section className="grid grid-cols-2 gap-4 rounded-card border border-ink/10 bg-white p-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-ink/50">Version</p>
            <p className="font-medium">{app.currentVersion.versionName}</p>
          </div>
          <div>
            <p className="text-ink/50">Size</p>
            <p className="font-medium">
              {(app.currentVersion.apkSizeBytes / (1024 * 1024)).toFixed(1)} MB
            </p>
          </div>
          <div>
            <p className="text-ink/50">Android</p>
            <p className="font-medium">{app.currentVersion.minAndroid}+</p>
          </div>
          {app.currentVersion.releaseNotes && (
            <div className="col-span-2 sm:col-span-4">
              <p className="text-ink/50">What's new</p>
              <p className="font-medium">{app.currentVersion.releaseNotes}</p>
            </div>
          )}
        </section>
      )}

      <section className="flex flex-wrap items-center gap-4 text-sm">
        {app.privacyPolicyUrl && (
          <a href={app.privacyPolicyUrl} className="text-brand-600 underline">
            Privacy Policy
          </a>
        )}
        <ReportButton appId={app.id} />
        <ShareButton appName={app.name} />
      </section>

      <section>
        <ReviewSection appId={app.id} />
      </section>
    </div>
  )
}
