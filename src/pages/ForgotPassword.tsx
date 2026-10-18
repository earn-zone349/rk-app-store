import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { requestPasswordReset } from '@/services/auth'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'রিসেট লিংক পাঠানো যায়নি।')
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-sm text-center">
        <h1 className="mb-2 text-xl font-semibold">ইমেইল চেক করুন</h1>
        <p className="text-sm text-ink/60">
          পাসওয়ার্ড রিসেট করার লিংক আপনার ইমেইলে পাঠানো হয়েছে।
        </p>
        <Link to="/login" className="mt-4 inline-block text-brand-600 underline">
          লগইন পাতায় ফিরে যান
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-2 text-xl font-semibold">পাসওয়ার্ড ভুলে গেছেন?</h1>
      <p className="mb-6 text-sm text-ink/60">
        আপনার ইমেইল দিন, আমরা একটা রিসেট লিংক পাঠাবো।
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm text-ink/70">
            ইমেইল
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-card border border-ink/15 px-3 py-2 outline-none focus:border-brand-500"
          />
        </div>

        {error && <p className="text-sm text-signal-red">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-card bg-brand-500 px-4 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {submitting ? 'পাঠানো হচ্ছে…' : 'রিসেট লিংক পাঠান'}
        </button>
      </form>

      <p className="mt-4 text-sm text-ink/60">
        <Link to="/login" className="text-brand-600 underline">
          লগইন পাতায় ফিরে যান
        </Link>
      </p>
    </div>
  )
}
