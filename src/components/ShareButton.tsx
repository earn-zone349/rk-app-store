import { useState } from 'react'
import { useLanguage } from '@/context/LanguageContext'

export default function ShareButton({ appName }: { appName: string }) {
  const { t } = useLanguage()
  const [copied, setCopied] = useState(false)

  async function handleShare() {
    const url = window.location.href
    // navigator.share is the mobile "share sheet" (WhatsApp, Messenger,
    // SMS, etc.) — supported on the phone browsers most of this store's
    // visitors will actually be using. Desktop browsers mostly don't
    // implement it, hence the clipboard fallback below.
    if (navigator.share) {
      try {
        await navigator.share({ title: appName, url })
      } catch {
        // AbortError when the user just closes the share sheet — not an
        // error worth surfacing.
      }
      return
    }

    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="text-ink/60 underline underline-offset-2 hover:text-ink"
    >
      {copied ? '✓ লিংক কপি হয়েছে' : t('action.share')}
    </button>
  )
}
