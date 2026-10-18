import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { exportMyData, deleteMyAccount } from '@/services/account'
import { signOut } from '@/services/auth'

export default function AccountSettings() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [exporting, setExporting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setExporting(true)
    try {
      await exportMyData()
    } finally {
      setExporting(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      const result = await deleteMyAccount()
      if (!result.ok) {
        setError(result.error ?? 'Account ডিলিট করা যায়নি।')
        setConfirmingDelete(false)
        return
      }
      await signOut()
      navigate('/')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-xl font-semibold">Account Settings</h1>
      <p className="mb-6 text-sm text-ink/50">{session?.user.email}</p>

      <div className="mb-6 rounded-card border border-ink/10 bg-white p-5">
        <p className="mb-1 font-medium">তোমার ডেটা ডাউনলোড করো</p>
        <p className="mb-3 text-sm text-ink/60">
          তোমার profile, review, ও favorite-এর একটা JSON ফাইল ডাউনলোড হবে।
        </p>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="rounded-card border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-brand-300 disabled:opacity-50"
        >
          {exporting ? 'তৈরি হচ্ছে…' : 'Data Export করো'}
        </button>
      </div>

      <div className="rounded-card border border-signal-red/30 bg-signal-red/5 p-5">
        <p className="mb-1 font-medium text-signal-red">Account ডিলিট করো</p>
        <p className="mb-3 text-sm text-ink/60">
          এটা স্থায়ী — তোমার profile, review, favorite সব মুছে যাবে। প্রকাশিত app থাকলে আগে Contact-এর মাধ্যমে
          যোগাযোগ করতে হবে।
        </p>

        {error && <p className="mb-3 text-sm text-signal-red">{error}</p>}

        {!confirmingDelete ? (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="rounded-card bg-signal-red px-4 py-2 text-sm font-medium text-white hover:bg-signal-red/90"
          >
            Account ডিলিট করো
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-card bg-signal-red px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {deleting ? 'ডিলিট হচ্ছে…' : 'নিশ্চিত — স্থায়ীভাবে ডিলিট করো'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="text-sm text-ink/50 underline"
            >
              বাতিল
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
