import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'

/**
 * Supabase's password-reset email links land here with a recovery session
 * already active (handled by supabase-js reading the URL fragment). The
 * user just needs to set a new password while that session is live.
 */
export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('পাসওয়ার্ড দুটো মিলছে না।')
      return
    }
    if (password.length < 8) {
      setError('পাসওয়ার্ড অন্তত ৮ অক্ষরের হতে হবে।')
      return
    }

    setSubmitting(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setDone(true)
      setTimeout(() => navigate('/login'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'পাসওয়ার্ড বদলানো যায়নি।')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-sm text-center">
        <h1 className="mb-2 text-xl font-semibold">পাসওয়ার্ড বদলানো হয়েছে</h1>
        <p className="text-sm text-ink/60">লগইন পাতায় নিয়ে যাওয়া হচ্ছে…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-xl font-semibold">নতুন পাসওয়ার্ড দিন</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="password" className="mb-1 block text-sm text-ink/70">
            নতুন পাসওয়ার্ড
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
        <div>
          <label htmlFor="confirmPassword" className="mb-1 block text-sm text-ink/70">
            আবার লিখুন
          </label>
          <input
            id="confirmPassword"
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-card border border-ink/15 px-3 py-2 outline-none focus:border-brand-500"
          />
        </div>

        {error && <p className="text-sm text-signal-red">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-card bg-brand-500 px-4 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {submitting ? 'বদলানো হচ্ছে…' : 'পাসওয়ার্ড বদলান'}
        </button>
      </form>
    </div>
  )
}
