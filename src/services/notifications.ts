import { supabase } from '@/lib/supabaseClient'
import { requestFcmToken } from '@/lib/firebase'

export interface AppNotification {
  id: string
  title: string
  body: string
  read: boolean
  createdAt: string
}

/** #74 — the persistent in-app list a bell icon shows, separate from (but written alongside) the FCM push. */
export async function fetchMyNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, title, body, read, created_at')
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    read: row.read,
    createdAt: row.created_at,
  }))
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase.from('notifications').update({ read: true }).eq('id', id)
}

export async function markAllNotificationsRead(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
}

/**
 * Call this from somewhere the developer explicitly opts in (a button,
 * not on page load) — browsers show a permission prompt the first time,
 * and prompting without the user having asked for it is exactly the kind
 * of thing that gets a site's notification permission auto-denied by the
 * browser after enough dismissals.
 */
export async function enablePushNotifications(): Promise<{ ok: boolean; error?: string }> {
  const token = await requestFcmToken()
  if (!token) {
    return { ok: false, error: 'Notification permission দেওয়া হয়নি, বা এই browser-এ push notification সাপোর্ট নেই।' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'আগে লগইন করতে হবে।' }

  const { error } = await supabase.from('fcm_tokens').upsert(
    { user_id: user.id, token },
    { onConflict: 'user_id,token' },
  )
  if (error) return { ok: false, error: 'Token সেভ করা যায়নি।' }

  return { ok: true }
}
