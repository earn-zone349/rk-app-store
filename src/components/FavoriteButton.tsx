import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isFavorited, toggleFavorite } from '@/services/community'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'

export default function FavoriteButton({ appId }: { appId: string }) {
  const { session } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [favorited, setFavorited] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!session) {
      setFavorited(false)
      return
    }
    isFavorited(appId).then(setFavorited)
  }, [appId, session])

  async function handleClick() {
    if (!session) {
      // Sends them to log in, then straight back to this same app page —
      // no reason to lose the favorite intent over a redirect.
      navigate('/login', { state: { from: window.location.pathname } })
      return
    }
    setBusy(true)
    try {
      const next = await toggleFavorite(appId)
      setFavorited(next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={`rounded-card border px-4 py-2 text-sm font-medium disabled:opacity-50 ${
        favorited ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink/15 text-ink/70 hover:border-brand-300'
      }`}
    >
      {favorited ? t('action.unfavorite') : t('action.favorite')}
    </button>
  )
}
