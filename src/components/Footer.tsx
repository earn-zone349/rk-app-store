import { Link } from 'react-router-dom'
import { useLanguage } from '@/context/LanguageContext'

export default function Footer() {
  const { t } = useLanguage()
  return (
    <footer className="border-t border-ink/10 py-8 text-sm text-ink/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} RK App Store</p>
        <div className="flex flex-wrap gap-4">
          <Link to="/privacy-policy" className="hover:text-ink">
            {t('footer.privacy')}
          </Link>
          <Link to="/terms" className="hover:text-ink">
            {t('footer.terms')}
          </Link>
          <Link to="/developer-terms" className="hover:text-ink">
            {t('footer.devTerms')}
          </Link>
          <Link to="/contact" className="hover:text-ink">
            {t('footer.contact')}
          </Link>
          <Link to="/dmca" className="hover:text-ink">
            DMCA
          </Link>
          <Link to="/developer-guide" className="hover:text-ink">
            Developer Guide
          </Link>
        </div>
      </div>
    </footer>
  )
}
