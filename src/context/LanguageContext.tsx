import { createContext, useContext, useState, useMemo, type ReactNode } from 'react'

export type Lang = 'bn' | 'en'

const STORAGE_KEY = 'rk-app-store-lang'

const dictionary = {
  bn: {
    'nav.categories': 'ক্যাটাগরি',
    'nav.developers': 'ডেভেলপার',
    'nav.login': 'লগইন',
    'nav.logout': 'লগআউট',
    'search.placeholder': 'অ্যাপ, গেম, ডেভেলপার খুঁজুন',
    'home.categories': 'ক্যাটাগরি',
    'home.trending': '🔥 ট্রেন্ডিং',
    'home.loading': 'লোড হচ্ছে…',
    'home.empty': 'এখনো কোনো অ্যাপ প্রকাশিত হয়নি।',
    'sort.downloads': 'সর্বাধিক ডাউনলোড',
    'sort.rating': 'সর্বোচ্চ রেটিং',
    'sort.newest': 'নতুন',
    'action.loadMore': 'আরও দেখুন',
    'action.download': 'APK ডাউনলোড করুন',
    'action.report': 'অ্যাপ রিপোর্ট করুন',
    'action.share': 'শেয়ার করুন',
    'nav.favorites': 'Favorites',
    'action.favorite': '☆ Favorite করুন',
    'action.unfavorite': '★ Favorite করা আছে',
    'footer.privacy': 'প্রাইভেসি পলিসি',
    'footer.terms': 'শর্তাবলী',
    'footer.devTerms': 'ডেভেলপার শর্তাবলী',
    'footer.contact': 'যোগাযোগ',
  },
  en: {
    'nav.categories': 'Categories',
    'nav.developers': 'Developers',
    'nav.login': 'Log in',
    'nav.logout': 'Log out',
    'search.placeholder': 'Search apps, games, developers',
    'home.categories': 'Categories',
    'home.trending': '🔥 Trending',
    'home.loading': 'Loading…',
    'home.empty': 'No apps published yet.',
    'sort.downloads': 'Most Downloaded',
    'sort.rating': 'Highest Rated',
    'sort.newest': 'Newest',
    'action.loadMore': 'Load more',
    'action.download': 'Download APK',
    'action.report': 'Report app',
    'action.share': 'Share',
    'nav.favorites': 'Favorites',
    'action.favorite': '☆ Add to favorites',
    'action.unfavorite': '★ Favorited',
    'footer.privacy': 'Privacy Policy',
    'footer.terms': 'Terms of Service',
    'footer.devTerms': 'Developer Terms',
    'footer.contact': 'Contact',
  },
} as const

export type TranslationKey = keyof typeof dictionary.bn

interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: TranslationKey) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function getInitialLang(): Lang {
  if (typeof window === 'undefined') return 'bn'
  const saved = window.localStorage.getItem(STORAGE_KEY)
  return saved === 'en' ? 'en' : 'bn'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getInitialLang)

  function setLang(next: Lang) {
    setLangState(next)
    window.localStorage.setItem(STORAGE_KEY, next)
    document.documentElement.lang = next
  }

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      setLang,
      t: (key) => dictionary[lang][key] ?? dictionary.bn[key] ?? key,
    }),
    [lang],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
// eslint-disable-next-line react-refresh/only-export-components
export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used inside <LanguageProvider>')
  return ctx
}
