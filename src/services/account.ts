import { supabase } from '@/lib/supabaseClient'

/**
 * #82 — everything this store actually holds about the signed-in user,
 * gathered from the same RLS-scoped queries any of their own pages
 * already use (no new backend logic needed for export — export-my-data
 * doesn't touch anything a user couldn't already see piece by piece
 * across the app; this just gathers it into one file).
 */
export async function exportMyData(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('আগে লগইন করতে হবে।')

  const [profile, reviews, favorites, developer] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle(),
    supabase.from('reviews').select('app_id, rating, comment, created_at').eq('user_id', user.id),
    supabase.from('favorites').select('app_id, created_at').eq('user_id', user.id),
    supabase.from('developers').select('developer_name, phone, website, support_email, created_at').eq('user_id', user.id).maybeSingle(),
  ])

  const exportData = {
    exportedAt: new Date().toISOString(),
    account: { email: user.email, userId: user.id, createdAt: user.created_at },
    profile: profile.data ?? null,
    developerProfile: developer.data ?? null,
    reviews: reviews.data ?? [],
    favorites: favorites.data ?? [],
  }

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `rk-app-store-data-${user.id.slice(0, 8)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export async function deleteMyAccount(): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string }>('delete-account', {
    method: 'POST',
  })
  if (error) return { ok: false, error: 'পাঠানো যায়নি — একটু পরে আবার চেষ্টা করো।' }
  return data ?? { ok: false, error: 'কোনো উত্তর পাওয়া যায়নি।' }
}
