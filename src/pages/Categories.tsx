import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AppCard from '@/components/AppCard'
import { fetchApps, fetchCategories } from '@/services/apps'
import { useLanguage } from '@/context/LanguageContext'
import type { AppListing, Category } from '@/types'

const PAGE_SIZE = 12

export default function Categories() {
  const { slug } = useParams<{ slug?: string }>()
  const { t } = useLanguage()
  const [categories, setCategories] = useState<Category[]>([])
  const [apps, setApps] = useState<AppListing[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetchCategories(),
      slug
        ? fetchApps({ categorySlug: slug, page: 1, pageSize: PAGE_SIZE })
        : Promise.resolve({ apps: [], hasMore: false, total: 0 }),
    ]).then(([categoriesResult, appsResult]) => {
      setCategories(categoriesResult)
      setApps(appsResult.apps)
      setHasMore(appsResult.hasMore)
      setPage(1)
      setLoading(false)
    })
  }, [slug])

  async function loadMore() {
    if (!slug) return
    setLoadingMore(true)
    const nextPage = page + 1
    const result = await fetchApps({ categorySlug: slug, page: nextPage, pageSize: PAGE_SIZE })
    setApps((prev) => [...prev, ...result.apps])
    setHasMore(result.hasMore)
    setPage(nextPage)
    setLoadingMore(false)
  }

  const activeCategory = categories.find((c) => c.slug === slug)

  if (!slug) {
    return (
      <div>
        <h1 className="mb-4 text-lg font-semibold">{t('home.categories')}</h1>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {categories.map((category) => (
            <Link
              key={category.id}
              to={`/categories/${category.slug}`}
              className="flex flex-col items-center gap-2 rounded-card border border-ink/10 bg-white p-4 text-center hover:border-brand-500"
            >
              <span className="text-2xl">{category.icon}</span>
              <span className="text-sm font-medium">{category.name}</span>
            </Link>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold">
        {activeCategory ? `${activeCategory.icon} ${activeCategory.name}` : 'Category'}
      </h1>
      {loading ? (
        <p className="text-sm text-ink/50">{t('home.loading')}</p>
      ) : apps.length === 0 ? (
        <p className="text-sm text-ink/50">No apps in this category yet.</p>
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
    </div>
  )
}
