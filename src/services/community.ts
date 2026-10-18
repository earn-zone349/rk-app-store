import { supabase } from '@/lib/supabaseClient'
import { mapAppRow, type AppRow } from '@/services/appsDev'
import type { Review } from '@/types'

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

interface ReviewRow {
  id: string
  app_id: string
  user_id: string
  rating: number
  comment: string | null
  created_at: string
}

/**
 * BUG FIX: reviews.user_id and profiles.user_id both independently
 * reference auth.users(id) — there is no foreign key from reviews
 * straight to profiles. PostgREST can only auto-resolve an embedded
 * `profiles(display_name)` select when a direct FK exists between the two
 * tables being joined; without one it throws "could not find a
 * relationship" at request time, which would have made every review list
 * fail to load. Fetching display names as a separate lookup and merging
 * in JS sidesteps needing that FK to exist at all — the same two-step
 * pattern fetchMyFavoriteApps() already uses for a similar reason.
 */
async function attachDisplayNames<T extends { user_id: string }>(
  rows: T[],
): Promise<Map<string, string>> {
  const userIds = [...new Set(rows.map((r) => r.user_id))]
  if (userIds.length === 0) return new Map()

  const { data } = await supabase.from('profiles').select('user_id, display_name').in('user_id', userIds)
  return new Map((data ?? []).map((p) => [p.user_id, p.display_name]))
}

function mapReviewRow(row: ReviewRow, displayName: string | undefined): Review {
  return {
    id: row.id,
    appId: row.app_id,
    userId: row.user_id,
    userName: displayName ?? 'নাম-প্রকাশ-না-করা ব্যবহারকারী',
    rating: row.rating,
    comment: row.comment ?? undefined,
    createdAt: row.created_at,
  }
}

export async function fetchReviews(appId: string): Promise<Review[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, app_id, user_id, rating, comment, created_at')
    .eq('app_id', appId)
    .order('created_at', { ascending: false })

  if (error) throw error
  const rows = data ?? []
  const names = await attachDisplayNames(rows)
  return rows.map((row) => mapReviewRow(row, names.get(row.user_id)))
}

export async function fetchMyReview(appId: string): Promise<Review | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('reviews')
    .select('id, app_id, user_id, rating, comment, created_at')
    .eq('app_id', appId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const names = await attachDisplayNames([data])
  return mapReviewRow(data, names.get(data.user_id))
}

/**
 * One review per (app, user) — the `reviews_app_id_user_id_key` unique
 * constraint from 0001_init.sql means a second insert for the same pair
 * fails; upsert (insert ... on conflict update) turns "submit a review" and
 * "edit my review" into the same call instead of two separate code paths.
 *
 * `displayName` is only used the first time someone ever reviews anything
 * — profiles.user_id is the primary key, so upserting it here just updates
 * their chosen name if they already had one (in effect: it's set once,
 * unless the reviewer deliberately changes it while reviewing again).
 */
export async function submitReview(params: {
  appId: string
  rating: number
  comment: string
  displayName: string
}): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('রিভিউ দিতে হলে আগে লগইন করতে হবে।')

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ user_id: user.id, display_name: params.displayName.trim() })
  if (profileError) throw profileError

  const { error: reviewError } = await supabase
    .from('reviews')
    .upsert(
      { app_id: params.appId, user_id: user.id, rating: params.rating, comment: params.comment.trim() || null },
      { onConflict: 'app_id,user_id' },
    )
  if (reviewError) throw reviewError
}

export async function deleteMyReview(appId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase.from('reviews').delete().eq('app_id', appId).eq('user_id', user.id)
  if (error) throw error
}

/** Whether the signed-in user already has a display name set (skips asking again on future reviews). */
export async function fetchMyDisplayName(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle()
  return data?.display_name ?? null
}

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------

export async function isFavorited(appId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false

  const { data } = await supabase
    .from('favorites')
    .select('app_id')
    .eq('app_id', appId)
    .eq('user_id', user.id)
    .maybeSingle()
  return Boolean(data)
}

/** Toggles and returns the new state — lets a button just flip based on the return value instead of tracking state in two places. */
export async function toggleFavorite(appId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Favorite করতে হলে আগে লগইন করতে হবে।')

  const already = await isFavorited(appId)
  if (already) {
    await supabase.from('favorites').delete().eq('app_id', appId).eq('user_id', user.id)
    return false
  }
  await supabase.from('favorites').insert({ app_id: appId, user_id: user.id })
  return true
}

export async function fetchMyFavoriteApps() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  // Two-step (favorite app_ids, then those apps) rather than a single
  // embedded query — favorites can point at apps that are no longer
  // 'approved' (suspended after being favorited, say), and fetchApps-style
  // consumer queries always filter to approved-only; keeping this as its
  // own explicit query makes that filtering visible here rather than
  // silently inherited from RLS.
  const { data: favRows, error: favError } = await supabase
    .from('favorites')
    .select('app_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (favError) throw favError
  if (!favRows || favRows.length === 0) return []

  const { data: appRows, error: appError } = await supabase
    .from('apps')
    .select('*, screenshots(url, position)')
    .in(
      'id',
      favRows.map((f) => f.app_id),
    )
    .eq('status', 'approved')
  if (appError) throw appError

  // Re-sort to match favorites order (most recently favorited first) —
  // the `in()` query above doesn't preserve the order of the id list.
  const byId = new Map((appRows ?? []).map((row) => [row.id, row]))
  return favRows
    .map((f) => byId.get(f.app_id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row) => mapAppRow(row as unknown as AppRow))
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function submitReport(appId: string, reason: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Report করতে হলে আগে লগইন করতে হবে।')

  const { error } = await supabase.from('reports').insert({ app_id: appId, user_id: user.id, reason: reason.trim() })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Download counting
// ---------------------------------------------------------------------------

/** Best-effort counter — see increment_download_count() in 0010_community.sql for why exactness isn't the goal here. */
export async function trackDownload(appId: string): Promise<void> {
  try {
    await supabase.rpc('increment_download_count', { p_app_id: appId })
  } catch {
    // A failed counter increment should never block the actual download —
    // the <a href> download itself already fired by the time this runs.
  }
}
