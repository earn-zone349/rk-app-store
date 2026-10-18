import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AppCard from '@/components/AppCard'
import { fetchApps, fetchCategories } from '@/services/apps'
import { useLanguage } from '@/context/LanguageContext'
import { useDocumentMeta } from '@/hooks/useDocumentMeta'
import type { AppListing, Category } from '@/types'

const PAGE_SIZE = 12

export default function Home() {
  const { t } = useLanguage()
  useDocumentMeta('Home', 'বাংলাদেশি Android app store — নিরাপদ, স্ক্যান করা APK ডাউনলোড করো।')
  const [apps, setApps] = useState<AppListing[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetchApps({ sort: 'downloads', page: 1, pageSize: PAGE_SIZE }),
      fetchCategories(),
    ]).then(([appsResult, categoriesResult]) => {
      setApps(appsResult.apps)
      setHasMore(appsResult.hasMore)
      setCategories(categoriesResult)
      setPage(1)
      setLoading(false)
    })
  }, [])

  async function loadMore() {
    setLoadingMore(true)
    const nextPage = page + 1
    const result = await fetchApps({ sort: 'downloads', page: nextPage, pageSize: PAGE_SIZE })
    setApps((prev) => [...prev, ...result.apps])
    setHasMore(result.hasMore)
    setPage(nextPage)
    setLoadingMore(false)
  }

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="mb-3 text-lg font-semibold">{t('home.categories')}</h2>
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <Link
              key={category.id}
              to={`/categories/${category.slug}`}
              className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink/80 hover:border-brand-500 hover:text-brand-700"
            >
              <span className="mr-1">{category.icon}</span>
              {category.name}
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t('home.trending')}</h2>
        {loading ? (
          <p className="text-sm text-ink/50">{t('home.loading')}</p>
        ) : apps.length === 0 ? (
          <p className="text-sm text-ink/50">{t('home.empty')}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {apps.map((app) => (
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
      </section>
    </div>
  )
}
