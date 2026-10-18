import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { signIn } from '@/services/auth'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email, password)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'লগইন করা যায়নি। আবার চেষ্টা করুন।')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-xl font-semibold">লগইন</h1>
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
        <div>
          <label htmlFor="password" className="mb-1 block text-sm text-ink/70">
            পাসওয়ার্ড
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-card border border-ink/15 px-3 py-2 outline-none focus:border-brand-500"
          />
        </div>

        {error && <p className="text-sm text-signal-red">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-card bg-brand-500 px-4 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {submitting ? 'লগইন হচ্ছে…' : 'লগইন করুন'}
        </button>
      </form>

      <p className="mt-4 text-sm text-ink/60">
        অ্যাকাউন্ট নেই?{' '}
        <Link to="/signup" className="text-brand-600 underline">
          নতুন অ্যাকাউন্ট খুলুন
        </Link>
      </p>
      <p className="mt-2 text-sm text-ink/60">
        <Link to="/forgot-password" className="text-brand-600 underline">
          পাসওয়ার্ড ভুলে গেছেন?
        </Link>
      </p>
    </div>
  )
}
