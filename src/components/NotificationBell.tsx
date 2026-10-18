import { useEffect, useRef, useState } from 'react'
import {
  fetchMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '@/services/notifications'
import { useAuth } from '@/context/AuthContext'

export default function NotificationBell() {
  const { session } = useAuth()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loaded, setLoaded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    if (!session) return
    // Poll every 60s rather than a realtime subscription — a store this
    // size doesn't need sub-second delivery for "your app was reviewed,"
    // and polling avoids holding an open websocket per visitor.
    fetchMyNotifications().then((rows) => {
      setNotifications(rows)
      setLoaded(true)
    })
    const interval = setInterval(() => fetchMyNotifications().then(setNotifications), 60_000)
    return () => clearInterval(interval)
  }, [session])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleOpen() {
    setOpen((prev) => !prev)
    if (!loaded) {
      const rows = await fetchMyNotifications()
      setNotifications(rows)
      setLoaded(true)
    }
  }

  async function handleItemClick(notification: AppNotification) {
    if (!notification.read) {
      await markNotificationRead(notification.id)
      setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)))
    }
  }

  if (!session) return null

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Notifications"
        className="relative rounded-full p-1.5 text-ink/60 hover:bg-ink/5 hover:text-ink"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal-red px-1 text-[10px] font-medium text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-card border border-ink/10 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-ink/10 px-3 py-2">
            <p className="text-sm font-medium">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={async () => {
                  await markAllNotificationsRead()
                  setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
                }}
                className="text-xs text-brand-600 underline"
              >
                সব পড়া হয়েছে চিহ্নিত করো
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-center text-sm text-ink/40">কোনো notification নেই।</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleItemClick(n)}
                  className={`block w-full border-b border-ink/5 px-3 py-2 text-left text-sm last:border-0 ${
                    n.read ? 'text-ink/50' : 'bg-brand-50/50 font-medium text-ink'
                  }`}
                >
                  <p>{n.title}</p>
                  <p className="text-xs font-normal text-ink/50">{n.body}</p>
                  <p className="mt-0.5 text-[10px] font-normal text-ink/30">
                    {new Date(n.createdAt).toLocaleString('bn-BD')}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
