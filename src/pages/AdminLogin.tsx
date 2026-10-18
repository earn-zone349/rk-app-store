import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { signIn, signOut } from '@/services/auth'
import { verifyAdminTotp } from '@/services/admin'
import { supabase } from '@/lib/supabaseClient'

export default function AdminLogin() {
  const [step, setStep] = useState<'credentials' | 'totp'>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  async function handleCredentials(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email, password)
      // A successful signIn() here only proves the password was right —
      // it says nothing about whether this account is an admin. That's
      // deliberately left for the TOTP step to reveal (see
      // admin-verify-totp/index.ts's identical-error-message note): a
      // wrong password and "right password, not an admin" both end up
      // needing the same next step, so there's nothing to leak either way.
      setStep('totp')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'লগইন করা যায়নি।')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleTotp(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await verifyAdminTotp(code)
      if (!result.verified) {
        setError(result.error ?? 'ভুল কোড।')
        return
      }
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) sessionStorage.setItem('rk_admin_totp_verified', user.id)
      navigate('/admin', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'যাচাই করা যায়নি।')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleWrongAccount() {
    await signOut()
    setStep('credentials')
    setEmail('')
    setPassword('')
    setCode('')
    setError(null)
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-xl font-semibold">Admin Login</h1>
      <p className="mb-6 text-sm text-ink/50">
        {step === 'credentials' ? 'শুধু admin account-এর জন্য।' : 'তোমার authenticator app থেকে ৬-সংখ্যার কোড দাও।'}
      </p>

      {step === 'credentials' && (
        <form onSubmit={handleCredentials} className="flex flex-col gap-4">
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
            {submitting ? 'যাচাই হচ্ছে…' : 'পরবর্তী ধাপ'}
          </button>
        </form>
      )}

      {step === 'totp' && (
        <form onSubmit={handleTotp} className="flex flex-col gap-4">
          <div>
            <label htmlFor="code" className="mb-1 block text-sm text-ink/70">
              ৬-সংখ্যার কোড
            </label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-card border border-ink/15 px-3 py-2 text-center text-2xl tracking-[0.5em] outline-none focus:border-brand-500"
              placeholder="000000"
            />
          </div>

          {error && <p className="text-sm text-signal-red">{error}</p>}

          <button
            type="submit"
            disabled={submitting || code.length !== 6}
            className="rounded-card bg-brand-500 px-4 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {submitting ? 'যাচাই হচ্ছে…' : 'প্রবেশ করুন'}
          </button>

          <button type="button" onClick={handleWrongAccount} className="text-sm text-ink/50 underline">
            ভুল account? আবার শুরু করো
          </button>
        </form>
      )}
    </div>
  )
}
