import { supabase } from '@/lib/supabaseClient'
import { mapAppRow, mapVersionRow, type AppRow } from '@/services/appsDev'
import type { AppListing, Category } from '@/types'

/**
 * Phase 8 prerequisite fix — this file was Phase 1/2 mock data
 * (`APPS`/`CATEGORIES` arrays in memory) that nothing after Phase 2 ever
 * replaced, even though Phase 3 built the real `apps`/`categories` tables
 * and Phase 4/5 built real developer submission on top of them. The public
 * storefront (Home, Search, Categories, AppDetails) was quietly still
 * showing 44 fake "Sample App" listings this whole time, completely
 * disconnected from anything a developer actually submitted.
 *
 * Every function below keeps the exact same name/signature/return shape
 * the mock version had — Home.tsx, Search.tsx, Categories.tsx, and
 * AppDetails.tsx needed zero changes to start showing real data.
 */

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from('categories').select('*').order('name')
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    icon: row.icon ?? undefined,
  }))
}

export interface FetchAppsOptions {
  categorySlug?: string
  query?: string
  sort?: 'newest' | 'downloads' | 'rating'
  page?: number // 1-indexed
  pageSize?: number
}

export interface FetchAppsResult {
  apps: AppListing[]
  hasMore: boolean
  total: number
}

export async function fetchApps(options?: FetchAppsOptions): Promise<FetchAppsResult> {
  const page = options?.page ?? 1
  const pageSize = options?.pageSize ?? 12
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  // count: 'exact' here (not head:true, since we need the rows too) — one
  // round trip gets both the page of results and the total count needed
  // for `hasMore`, instead of a separate query for each.
  let query = supabase
    .from('apps')
    .select('*, screenshots(url, position)', { count: 'exact' })
    .eq('status', 'approved') // only ever show approved apps publicly — pending/rejected/suspended stay invisible here regardless of what's passed in

  if (options?.categorySlug) {
    // apps.category_id stores the category's `id`, not its `slug` — for
    // most seeded categories those happen to be the same string (e.g.
    // 'games'/'games'), which is exactly the kind of coincidence that
    // hides a bug: 'health-fitness' (slug) vs 'health' (id) don't match,
    // so filtering directly on categorySlug silently returned zero apps
    // for that one category. Resolve slug -> id first instead of relying
    // on them lining up.
    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', options.categorySlug)
      .maybeSingle()

    if (!category) return { apps: [], hasMore: false, total: 0 } // unknown category slug in the URL
    query = query.eq('category_id', category.id)
  }
  if (options?.query) {
    // PostgREST `or` with ilike — case-insensitive partial match on either
    // column. `%` wildcards on both sides for a "contains" search rather
    // than "starts with".
    const q = options.query.replace(/[%,]/g, '') // strip characters that would break the or-filter syntax
    query = query.or(`name.ilike.%${q}%,short_description.ilike.%${q}%`)
  }

  if (options?.sort === 'downloads') query = query.order('download_count', { ascending: false })
  else if (options?.sort === 'rating') query = query.order('rating', { ascending: false })
  else if (options?.sort === 'newest') query = query.order('created_at', { ascending: false })
  else query = query.order('download_count', { ascending: false }) // default, matches the old mock's implicit order

  const { data, error, count } = await query.range(from, to)
  if (error) throw error

  const total = count ?? 0
  const apps = (data ?? []).map((row) => mapAppRow(row as unknown as AppRow))
  return { apps, hasMore: from + apps.length < total, total }
}

export async function fetchAppBySlug(slug: string): Promise<AppListing | null> {
  const { data: appRow, error: appError } = await supabase
    .from('apps')
    .select('*, screenshots(url, position)')
    .eq('slug', slug)
    .eq('status', 'approved') // a pending/rejected/suspended app's page 404s for the public, same as it not existing
    .maybeSingle()

  if (appError) throw appError
  if (!appRow) return null

  const app = mapAppRow(appRow as unknown as AppRow)

  // #68 — the developer/admin-chosen "live" version (not just whichever
  // has the highest version_code — a rolled-back app should actually serve
  // the older APK, not silently keep pointing at a newer one).
  const { data: versionRow } = await supabase
    .from('app_versions')
    .select('*')
    .eq('app_id', app.id)
    .eq('is_current', true)
    .maybeSingle()

  return {
    ...app,
    currentVersion: versionRow ? mapVersionRow(versionRow) : undefined,
  }
}
