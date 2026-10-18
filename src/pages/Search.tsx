import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AppCard from '@/components/AppCard'
import { fetchApps } from '@/services/apps'
import { useLanguage } from '@/context/LanguageContext'
import type { AppListing } from '@/types'

const PAGE_SIZE = 12

export default function Search() {
  const { t } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const sort = (searchParams.get('sort') as 'newest' | 'downloads' | 'rating') || 'downloads'
  const [results, setResults] = useState<AppListing[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetchApps({ query, sort, page: 1, pageSize: PAGE_SIZE }).then((result) => {
      setResults(result.apps)
      setHasMore(result.hasMore)
      setPage(1)
      setLoading(false)
    })
  }, [query, sort])

  async function loadMore() {
    setLoadingMore(true)
    const nextPage = page + 1
    const result = await fetchApps({ query, sort, page: nextPage, pageSize: PAGE_SIZE })
    setResults((prev) => [...prev, ...result.apps])
    setHasMore(result.hasMore)
    setPage(nextPage)
    setLoadingMore(false)
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">
          {query ? `Results for "${query}"` : 'All apps'}
        </h1>
        <select
          value={sort}
          onChange={(e) => setSearchParams({ q: query, sort: e.target.value })}
          className="rounded-card border border-ink/15 bg-white px-3 py-1.5 text-sm"
        >
          <option value="downloads">{t('sort.downloads')}</option>
          <option value="rating">{t('sort.rating')}</option>
          <option value="newest">{t('sort.newest')}</option>
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-ink/50">{t('home.loading')}</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-ink/50">No apps matched your search.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {results.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-card border border-ink/15 bg-white px-6 py-2 text-sm font-medium hover:border-brand-500 disabled:opacity-60"
              >
                {loadingMore ? t('home.loading') : t('action.loadMore')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
