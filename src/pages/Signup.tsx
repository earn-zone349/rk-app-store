import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signUp } from '@/services/auth'
import { supabase } from '@/lib/supabaseClient'
import Captcha from '@/components/Captcha'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
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
      // Phase 6, step 51: IP-based rate limit, checked server-side via
      // rate-limit-check (see that function for why this can't be done
      // client-side — there's no logged-in user id yet at signup time).
      const { data: rateLimitData } = await supabase.functions.invoke<{ allowed: boolean }>('rate-limit-check', {
        body: { action: 'signup' },
      })
      if (rateLimitData && !rateLimitData.allowed) {
        setError('অল্প সময়ের মধ্যে অনেকগুলো অ্যাকাউন্ট তৈরির চেষ্টা হয়েছে — একটু পরে আবার চেষ্টা করো।')
        setSubmitting(false)
        return
      }

      await signUp(email, password, captchaToken ?? undefined)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'অ্যাকাউন্ট তৈরি করা যায়নি।')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-sm text-center">
        <h1 className="mb-2 text-xl font-semibold">ইমেইল চেক করুন</h1>
        <p className="text-sm text-ink/60">
          আপনার ইমেইলে একটা confirmation link পাঠানো হয়েছে। সেটাতে ক্লিক করে
          অ্যাকাউন্ট নিশ্চিত করুন।
        </p>
        <button
          onClick={() => navigate('/login')}
          className="mt-4 text-brand-600 underline"
        >
          লগইন পাতায় ফিরে যান
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-xl font-semibold">নতুন অ্যাকাউন্ট</h1>
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
        <div>
          <label htmlFor="confirmPassword" className="mb-1 block text-sm text-ink/70">
            পাসওয়ার্ড আবার লিখুন
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

        <Captcha onVerify={setCaptchaToken} />

        {error && <p className="text-sm text-signal-red">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-card bg-brand-500 px-4 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {submitting ? 'তৈরি হচ্ছে…' : 'অ্যাকাউন্ট তৈরি করুন'}
        </button>
      </form>

      <p className="mt-4 text-sm text-ink/60">
        আগে থেকেই অ্যাকাউন্ট আছে?{' '}
        <Link to="/login" className="text-brand-600 underline">
          লগইন করুন
        </Link>
      </p>
    </div>
  )
}
