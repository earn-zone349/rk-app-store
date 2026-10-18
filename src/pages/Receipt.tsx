import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchMyDeveloperProfile } from '@/services/developers'
import { fetchMyPayments, type Payment } from '@/services/payments'
import type { Developer } from '@/types'

/**
 * #36 — "invoice/receipt generation." The original roadmap wording
 * assumed this would be emailed (needs an email service — see chat: user
 * chose FCM for notifications instead, so this stays email-free by
 * design). A printable in-app page achieves the same goal a receipt is
 * actually for — the developer has a record they can save/print/screenshot
 * — without needing any new external account.
 */
export default function Receipt() {
  const [developer, setDeveloper] = useState<Developer | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMyDeveloperProfile().then(async (dev) => {
      setDeveloper(dev)
      if (dev) setPayments(await fetchMyPayments(dev.id))
      setLoading(false)
    })
  }, [])

  if (loading) return <p className="text-sm text-ink/50">লোড হচ্ছে…</p>
  if (!developer) return <p className="text-sm text-signal-red">Developer profile পাওয়া যায়নি।</p>

  const successfulPayments = payments.filter((p) => p.status === 'success')

  return (
    <div className="mx-auto max-w-lg">
      {/* print:hidden — this bar has no reason to appear on the printed/PDF version */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <h1 className="text-xl font-semibold">Payment Receipt</h1>
        <div className="flex gap-3">
          <Link to="/developer" className="text-sm text-ink/50 underline">
            ← Dashboard
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-card bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
          >
            Print / Save as PDF
          </button>
        </div>
      </div>

      {successfulPayments.length === 0 ? (
        <p className="rounded-card border border-ink/10 bg-ink/[0.02] p-6 text-center text-sm text-ink/50">
          কোনো সফল payment পাওয়া যায়নি।
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {successfulPayments.map((payment) => (
            <div key={payment.id} className="rounded-card border border-ink/10 bg-white p-6">
              <div className="mb-4 flex items-start justify-between border-b border-ink/10 pb-4">
                <div>
                  <p className="font-semibold">RK App Store</p>
                  <p className="text-xs text-ink/50">Developer Publishing Fee — Receipt</p>
                </div>
                <p className="text-xs text-ink/50">{new Date(payment.createdAt).toLocaleDateString('bn-BD')}</p>
              </div>

              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-ink/50">Developer</dt>
                <dd className="text-right">{developer.developerName}</dd>

                <dt className="text-ink/50">Transaction ID</dt>
                <dd className="text-right font-mono text-xs">{payment.gatewayReference ?? payment.id}</dd>

                <dt className="text-ink/50">Payment Method</dt>
                <dd className="text-right">{payment.gateway === 'sslcommerz' ? 'SSLCommerz' : payment.gateway}</dd>

                <dt className="text-ink/50">Status</dt>
                <dd className="text-right text-signal-green">✓ সফল</dd>
              </dl>

              <div className="mt-4 flex items-center justify-between border-t border-ink/10 pt-4">
                <span className="font-medium">মোট</span>
                <span className="text-lg font-semibold">
                  {payment.amount.toLocaleString('bn-BD')} {payment.currency}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
