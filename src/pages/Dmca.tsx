import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { fetchAppBySlug } from '@/services/apps'

export default function Dmca() {
  const [appSlug, setAppSlug] = useState('')
  const [claimantName, setClaimantName] = useState('')
  const [claimantEmail, setClaimantEmail] = useState('')
  const [copyrightedWork, setCopyrightedWork] = useState('')
  const [infringementDescription, setInfringementDescription] = useState('')
  const [declaration, setDeclaration] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!declaration) {
      setError('নিচের declaration-এ টিক দিতে হবে।')
      return
    }

    setSubmitting(true)
    try {
      // Look the app up by its URL slug (what a claimant would actually
      // have — the page URL — not an internal app id) before filing,
      // so an obviously wrong/typo'd link fails clearly here instead of
      // silently creating an unusable claim with no real app behind it.
      const app = await fetchAppBySlug(appSlug.trim())
      if (!app) {
        setError('এই slug/URL-এ কোনো app পাওয়া যায়নি — app-এর পাতার URL থেকে শেষের অংশটা কপি করো (যেমন /app/এই-অংশটা)।')
        return
      }

      const { error: insertError } = await supabase.from('dmca_reports').insert({
        app_id: app.id,
        claimant_name: claimantName,
        claimant_email: claimantEmail,
        copyrighted_work: copyrightedWork,
        infringement_description: infringementDescription,
        good_faith_declaration: declaration,
      })
      if (insertError) throw insertError

      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'জমা দেওয়া যায়নি।')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <p className="mb-2 text-2xl">✓</p>
        <h1 className="mb-2 text-lg font-semibold">Claim জমা হয়েছে</h1>
        <p className="text-sm text-ink/60">আমাদের admin team এটা পর্যালোচনা করবে। প্রশ্ন থাকলে Contact পাতায় যোগাযোগ করো।</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-2 text-xl font-semibold">Copyright / DMCA Takedown Claim</h1>
      <p className="mb-6 text-sm text-ink/60">
        তোমার কপিরাইটযুক্ত কাজ কোনো app-এ অনুমতি ছাড়া ব্যবহার হয়েছে মনে হলে এই ফর্ম পূরণ করো।
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm text-ink/70">App-এর URL slug *</label>
          <input
            required
            value={appSlug}
            onChange={(e) => setAppSlug(e.target.value)}
            placeholder="যেমন: /app/example-app-name এর মধ্যে example-app-name অংশটা"
            className="w-full rounded-card border border-ink/15 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-ink/70">তোমার নাম *</label>
          <input
            required
            value={claimantName}
            onChange={(e) => setClaimantName(e.target.value)}
            className="w-full rounded-card border border-ink/15 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-ink/70">তোমার ইমেইল *</label>
          <input
            required
            type="email"
            value={claimantEmail}
            onChange={(e) => setClaimantEmail(e.target.value)}
            className="w-full rounded-card border border-ink/15 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-ink/70">কোন কপিরাইটযুক্ত কাজ? *</label>
          <textarea
            required
            rows={2}
            value={copyrightedWork}
            onChange={(e) => setCopyrightedWork(e.target.value)}
            placeholder="যেমন: আমার তোলা ছবি, আমার লেখা কোড/ডিজাইন ইত্যাদি"
            className="w-full rounded-card border border-ink/15 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-ink/70">কীভাবে লঙ্ঘন হয়েছে, বিস্তারিত লেখো *</label>
          <textarea
            required
            rows={4}
            value={infringementDescription}
            onChange={(e) => setInfringementDescription(e.target.value)}
            className="w-full rounded-card border border-ink/15 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>

        <label className="flex items-start gap-2 text-xs text-ink/70">
          <input
            type="checkbox"
            checked={declaration}
            onChange={(e) => setDeclaration(e.target.checked)}
            className="mt-0.5"
          />
          আমি সরল বিশ্বাসে (good faith) ঘোষণা করছি যে উপরের তথ্য সত্য, এবং এই কাজ ব্যবহারের অনুমতি কপিরাইট-মালিক, তার
          এজেন্ট, বা আইন দেয়নি।
        </label>

        {error && <p className="text-sm text-signal-red">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-card bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {submitting ? 'জমা হচ্ছে…' : 'Claim জমা দাও'}
        </button>
      </form>
    </div>
  )
}
