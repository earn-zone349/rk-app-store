import { useState } from 'react'
import { Link } from 'react-router-dom'
import { submitReport } from '@/services/community'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'

export default function ReportButton({ appId }: { appId: string }) {
  const { session } = useAuth()
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    if (!reason.trim()) {
      setError('কী সমস্যা সেটা লিখো।')
      return
    }
    setSubmitting(true)
    try {
      await submitReport(appId, reason)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report পাঠানো যায়নি।')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-ink/60 underline underline-offset-2 hover:text-ink"
      >
        {t('action.report')}
      </button>
    )
  }

  return (
    <div className="w-full max-w-sm rounded-card border border-ink/10 bg-white p-4">
      {done ? (
        <p className="text-sm text-signal-green">✓ Report পাঠানো হয়েছে — ধন্যবাদ, admin দেখবে।</p>
      ) : !session ? (
        <p className="text-sm text-ink/60">
          Report করতে হলে আগে{' '}
          <Link to="/login" state={{ from: window.location.pathname }} className="text-brand-600 underline">
            লগইন
          </Link>{' '}
          করো।
        </p>
      ) : (
        <>
          <p className="mb-2 text-sm font-medium">এই app-এ কী সমস্যা?</p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="যেমন: fake app, কাজ করে না, misleading screenshot ইত্যাদি"
            className="mb-2 w-full rounded-card border border-ink/15 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          {error && <p className="mb-2 text-sm text-signal-red">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-card bg-signal-red px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? 'পাঠানো হচ্ছে…' : 'Report পাঠাও'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-ink/50 underline">
              বাতিল
            </button>
          </div>
        </>
      )}
    </div>
  )
}
