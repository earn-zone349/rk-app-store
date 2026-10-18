import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { registerDeveloper, uploadIdDocument } from '@/services/developers'

export default function DeveloperOnboarding() {
  const [developerName, setDeveloperName] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [supportEmail, setSupportEmail] = useState('')
  const [description, setDescription] = useState('')
  const [idDocument, setIdDocument] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const developer = await registerDeveloper({ developerName, phone, website, supportEmail, description })
      if (idDocument) {
        // #29 — best-effort: a failed ID upload shouldn't block the whole
        // registration when everything else succeeded. The developer can
        // add it later (their dashboard can offer a retry — not blocking
        // for now since the badge itself stays "unverified" either way
        // until an admin looks at it).
        try {
          await uploadIdDocument(idDocument, developer.id)
        } catch (uploadErr) {
          console.error('ID document upload failed:', uploadErr)
        }
      }
      navigate('/developer')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Developer প্রোফাইল তৈরি করা যায়নি।')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-2 text-xl font-semibold">Developer হিসেবে নিবন্ধন করুন</h1>
      <p className="mb-6 text-sm text-ink/60">
        এই তথ্য তোমার developer profile-এ এবং প্রতিটা app-এর পাতায় দেখানো হবে।
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="developerName" className="mb-1 block text-sm text-ink/70">
            Developer/Studio নাম *
          </label>
          <input
            id="developerName"
            required
            maxLength={100}
            value={developerName}
            onChange={(e) => setDeveloperName(e.target.value)}
            className="w-full rounded-card border border-ink/15 px-3 py-2 outline-none focus:border-brand-500"
            placeholder="যেমন: RK Studio"
          />
        </div>

        <div>
          <label htmlFor="phone" className="mb-1 block text-sm text-ink/70">
            মোবাইল নাম্বার *
          </label>
          <input
            id="phone"
            type="tel"
            required
            pattern="01[0-9]{9}"
            title="১১ ডিজিটের বাংলাদেশি মোবাইল নাম্বার দাও, যেমন 01712345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-card border border-ink/15 px-3 py-2 outline-none focus:border-brand-500"
            placeholder="01XXXXXXXXX"
          />
          <p className="mt-1 text-xs text-ink/50">
            Publishing fee পে করার সময় SSLCommerz-এ এই নাম্বারটাই ব্যবহার হবে।
          </p>
        </div>

        <div>
          <label htmlFor="supportEmail" className="mb-1 block text-sm text-ink/70">
            Support ইমেইল
          </label>
          <input
            id="supportEmail"
            type="email"
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
            className="w-full rounded-card border border-ink/15 px-3 py-2 outline-none focus:border-brand-500"
          />
        </div>

        <div>
          <label htmlFor="website" className="mb-1 block text-sm text-ink/70">
            Website (ঐচ্ছিক)
          </label>
          <input
            id="website"
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="w-full rounded-card border border-ink/15 px-3 py-2 outline-none focus:border-brand-500"
            placeholder="https://"
          />
        </div>

        <div>
          <label htmlFor="description" className="mb-1 block text-sm text-ink/70">
            নিজের/স্টুডিওর সংক্ষিপ্ত পরিচিতি (ঐচ্ছিক)
          </label>
          <textarea
            id="description"
            rows={3}
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-card border border-ink/15 px-3 py-2 outline-none focus:border-brand-500"
          />
        </div>

        {error && <p className="text-sm text-signal-red">{error}</p>}

        <div>
          <label htmlFor="idDocument" className="mb-1 block text-sm text-ink/70">
            NID / Trade License (ঐচ্ছিক — verified badge পেতে সাহায্য করে)
          </label>
          <input
            id="idDocument"
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => setIdDocument(e.target.files?.[0] ?? null)}
          />
          <p className="mt-1 text-xs text-ink/50">
            শুধু admin দেখতে পাবে, verify করার জন্য — publicly কোথাও দেখানো হবে না।
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-card bg-brand-500 px-4 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {submitting ? 'তৈরি হচ্ছে…' : 'Developer প্রোফাইল তৈরি করুন'}
        </button>
      </form>
    </div>
  )
}
