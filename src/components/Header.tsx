import { Link, useNavigate } from 'react-router-dom'
import { useState, type FormEvent } from 'react'
import { useLanguage } from '@/context/LanguageContext'
import { useAuth } from '@/context/AuthContext'
import { signOut } from '@/services/auth'
import NotificationBell from '@/components/NotificationBell'

export default function Header() {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const { lang, setLang, t } = useLanguage()
  const { session } = useAuth()

  function handleSearch(e: FormEvent) {
    e.preventDefault()
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`)
    }
  }

  async function handleLogout() {
    await signOut()
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-10 border-b border-ink/10 bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link to="/" className="font-display text-xl font-semibold text-ink">
          RK App Store
        </Link>

        <form onSubmit={handleSearch} className="ml-auto flex-1 max-w-md">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.placeholder')}
            className="w-full rounded-card border border-ink/15 bg-white px-4 py-2 text-sm outline-none focus:border-brand-500"
            aria-label={t('search.placeholder')}
          />
        </form>

        <nav className="hidden items-center gap-4 text-sm font-medium text-ink/70 sm:flex">
          <Link to="/categories" className="hover:text-ink">
            {t('nav.categories')}
          </Link>
          <Link to="/developer" className="hover:text-ink">
            {t('nav.developers')}
          </Link>
          {session && (
            <Link to="/favorites" className="hover:text-ink">
              {t('nav.favorites')}
            </Link>
          )}
          {session && (
            <Link to="/account" className="hover:text-ink">
              Account
            </Link>
          )}
          {session && (
            <Link to="/support" className="hover:text-ink">
              Support
            </Link>
          )}
          {session ? (
            <button onClick={handleLogout} className="hover:text-ink">
              {t('nav.logout')}
            </button>
          ) : (
            <Link to="/login" className="hover:text-ink">
              {t('nav.login')}
            </Link>
          )}
        </nav>

        <button
          onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}
          className="rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:border-brand-500"
          aria-label="Toggle language"
        >
          {lang === 'bn' ? 'EN' : 'বাং'}
        </button>

        <NotificationBell />
      </div>
    </header>
  )
}
