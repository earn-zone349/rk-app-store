import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { fetchMyDeveloperProfile } from '@/services/developers'
import { fetchMyApps, fetchAppVersions } from '@/services/appsDev'
import { fetchAppSettings } from '@/services/settings'
import { startDeveloperPayment, fetchLatestFailureReason } from '@/services/payments'
import { runVirusScan } from '@/services/security'
import { enablePushNotifications } from '@/services/notifications'
import { SCAN_STATUS_LABEL } from '@/utils/scanStatusLabel'
import type { AppListing, AppSettings, AppVersion, Developer } from '@/types'

const STATUS_LABEL: Record<AppListing['status'], { text: string; className: string }> = {
  pending: { text: 'পর্যালোচনাধীন', className: 'bg-signal-amber/15 text-signal-amber' },
  approved: { text: 'প্রকাশিত', className: 'bg-signal-green/15 text-signal-green' },
  rejected: { text: 'প্রত্যাখ্যাত', className: 'bg-signal-red/15 text-signal-red' },
  suspended: { text: 'স্থগিত', className: 'bg-ink/10 text-ink/60' },
}

export default function DeveloperDashboard() {
  const { session, loading: authLoading } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const paymentReturn = searchParams.get('payment') // 'success' | 'fail' | 'cancel' | null
  const [developer, setDeveloper] = useState<Developer | null>(null)
  const [apps, setApps] = useState<AppListing[]>([])
  // Latest version's security status per app, keyed by app id — separate
  // from `apps` because it comes from a second query (app_versions), not
  // the apps table itself.
  const [latestVersions, setLatestVersions] = useState<Record<string, AppVersion | null>>({})
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)

  useEffect(() => {
    if (!session) return
    setLoading(true)
    Promise.all([fetchMyDeveloperProfile(), fetchAppSettings()]).then(async ([dev, appSettings]) => {
      setSettings(appSettings)
      if (!dev) {
        setNeedsOnboarding(true)
        setLoading(false)
        return
      }
      setDeveloper(dev)
      const myApps = await fetchMyApps(dev.id)
      setApps(myApps)
      setLoading(false)

      const versionEntries = await Promise.all(
        myApps.map(async (app) => {
          const versions = await fetchAppVersions(app.id)
          return [app.id, versions[0] ?? null] as const // fetchAppVersions orders newest-first
        }),
      )
      setLatestVersions(Object.fromEntries(versionEntries))
    })
    // Re-runs after a redirect back from SSLCommerz too (paymentReturn
    // changes the URL, not `session`) — see the effect below.
  }, [session])

  // While any app's latest version is still 'scanning', poll every 5s so
  // the badge below updates on its own once VirusTotal finishes — instead
  // of the developer having to manually reload the dashboard.
  useEffect(() => {
    const scanning = Object.values(latestVersions).filter((v) => v?.securityStatus === 'scanning')
    if (scanning.length === 0) return

    const interval = setInterval(async () => {
      const updates = await Promise.all(
        scanning.map(async (version) => {
          const result = await runVirusScan(version!.id, 'poll')
          return [version!.appId, result] as const
        }),
      )
      setLatestVersions((prev) => {
        const next = { ...prev }
        for (const [appId, result] of updates) {
          const current = next[appId]
          if (current && result.status !== 'scanning') {
            next[appId] = { ...current, securityStatus: result.status }
          }
        }
        return next
      })
    }, 5000)

    return () => clearInterval(interval)
  }, [latestVersions])

  // The SSLCommerz IPN webhook (server-to-server) is usually faster than the
  // browser redirect back to this page, but not guaranteed — so on
  // "?payment=success" we quietly re-fetch the developer profile a couple of
  // times to pick up payment_status='paid' as soon as it lands, instead of
  // making the developer manually refresh.
  useEffect(() => {
    if (paymentReturn !== 'success' || !session) return
    let cancelled = false
    let attempts = 0
    const interval = setInterval(async () => {
      attempts += 1
      try {
        const dev = await fetchMyDeveloperProfile()
        if (cancelled) return
        if (dev) setDeveloper(dev)
        if (dev && dev.paymentStatus === 'paid') clearInterval(interval)
      } catch {
        // A transient network blip here shouldn't crash the page — the
        // dashboard's normal "reload" already shows the up-to-date status,
        // this polling is just a nicety to avoid a manual refresh.
      } finally {
        if (attempts >= 5) clearInterval(interval)
      }
    }, 2000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [paymentReturn, session])

  if (!authLoading && !session) return <Navigate to="/login" replace />
  if (loading) return <p className="text-sm text-ink/50">লোড হচ্ছে…</p>
  if (needsOnboarding) return <Navigate to="/developer/onboarding" replace />
  if (!developer || !settings) return null

  const canPublish = developer.isOwner || (settings.paymentEnabled && developer.paymentStatus === 'paid')

  return (
    <div className="flex flex-col gap-6">
      {paymentReturn && (
        <PaymentReturnBanner
          status={paymentReturn}
          developerId={developer.id}
          onDismiss={() => {
            searchParams.delete('payment')
            setSearchParams(searchParams, { replace: true })
          }}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{developer.developerName}</h1>
          <p className="text-sm text-ink/50">
            {developer.verified ? '✓ Verified Developer' : 'Verification পেন্ডিং'}
            {' · '}
            <Link to="/developer/receipt" className="text-brand-600 underline">
              Receipt দেখো
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NotificationButton />
          {canPublish ? (
            <Link
              to="/developer/apps/new"
              className="rounded-card bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              + নতুন App যোগ করুন
            </Link>
          ) : null}
        </div>
      </div>

      {!canPublish && <PublishGateNotice developer={developer} settings={settings} />}

      {/* #92 — onboarding: a short, dismissable checklist for anyone who
          hasn't published anything yet, instead of leaving a blank
          dashboard to figure out on their own. */}
      {apps.length === 0 && <GettingStartedChecklist developer={developer} canPublish={canPublish} />}

      <section>
        <h2 className="mb-3 text-lg font-semibold">আমার Apps</h2>
        {apps.length === 0 ? (
          <p className="text-sm text-ink/50">এখনো কোনো app যোগ করা হয়নি।</p>
        ) : (
          <div className="flex flex-col gap-2">
            {apps.map((app) => {
              const status = STATUS_LABEL[app.status]
              const scan = latestVersions[app.id]?.securityStatus
                ? SCAN_STATUS_LABEL[latestVersions[app.id]!.securityStatus]
                : null
              return (
                <div key={app.id} className="rounded-card border border-ink/10 bg-white p-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-card bg-ink/5">
                      {app.iconUrl && (
                        <img src={app.iconUrl} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{app.name}</p>
                      <p className="text-xs text-ink/50">
                        {app.downloadCount.toLocaleString()} downloads · ⭐ {app.rating.toFixed(1)}
                      </p>
                    </div>
                    {scan && (
                      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${scan.className}`}>
                        {scan.text}
                      </span>
                    )}
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${status.className}`}>
                      {status.text}
                    </span>
                    <Link
                      to={`/developer/apps/${app.id}/versions/new`}
                      className="shrink-0 text-sm text-brand-600 underline"
                    >
                      নতুন Version
                    </Link>
                  </div>

                  {/* Phase 7 — admin's reject/suspend reason, if any. Cleared
                      automatically the moment an admin approves the app again. */}
                  {(app.status === 'rejected' || app.status === 'suspended') && app.statusReason && (
                    <p className="mt-2 rounded-card bg-signal-red/5 px-3 py-2 text-xs text-signal-red">
                      <span className="font-medium">কারণ:</span> {app.statusReason}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function NotificationButton() {
  const [state, setState] = useState<'idle' | 'requesting' | 'enabled' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setState('requesting')
    setError(null)
    const result = await enablePushNotifications()
    if (result.ok) {
      setState('enabled')
    } else {
      setState('error')
      setError(result.error ?? 'চালু করা যায়নি।')
    }
  }

  if (state === 'enabled') {
    return <span className="text-sm text-signal-green">🔔 Notification চালু আছে</span>
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={handleClick}
        disabled={state === 'requesting'}
        className="rounded-card border border-ink/15 px-3 py-2 text-sm text-ink/70 hover:border-brand-300 disabled:opacity-50"
      >
        {state === 'requesting' ? 'চালু হচ্ছে…' : '🔔 App status-এর জন্য Notification চালু করো'}
      </button>
      {error && <p className="mt-1 text-xs text-signal-red">{error}</p>}
    </div>
  )
}

function GettingStartedChecklist({ developer, canPublish }: { developer: Developer; canPublish: boolean }) {
  const steps = [
    { done: true, label: 'Developer profile তৈরি করা' },
    { done: Boolean(developer.idDocumentPath), label: 'ID document আপলোড করা (ঐচ্ছিক, verified badge-এর জন্য)' },
    { done: canPublish, label: 'Publishing fee দেওয়া' },
    { done: false, label: 'প্রথম app submit করা' },
  ]

  return (
    <div className="mb-8 rounded-card border border-brand-200 bg-brand-50 p-5">
      <p className="mb-3 font-medium">শুরু করার জন্য কয়েকটা ধাপ</p>
      <div className="flex flex-col gap-2">
        {steps.map((step) => (
          <div key={step.label} className="flex items-center gap-2 text-sm">
            <span className={step.done ? 'text-signal-green' : 'text-ink/30'}>{step.done ? '✓' : '○'}</span>
            <span className={step.done ? 'text-ink/50 line-through' : 'text-ink/80'}>{step.label}</span>
          </div>
        ))}
      </div>
      <Link to="/developer-guide" className="mt-3 inline-block text-sm text-brand-600 underline">
        পুরো Developer Guide পড়ো →
      </Link>
    </div>
  )
}

function PublishGateNotice({
  developer,
  settings,
}: {
  developer: Developer
  settings: AppSettings
}) {
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  if (developer.isOwner) return null

  if (!settings.paymentEnabled) {
    return (
      <div className="rounded-card border border-signal-amber/30 bg-signal-amber/10 p-4 text-sm">
        🚧 App publishing এখনো সবার জন্য খোলা হয়নি। খুব শীঘ্রই payment চালু হলে এখান থেকেই
        publishing fee দিয়ে app submit করতে পারবে।
      </div>
    )
  }

  if (developer.paymentStatus === 'paid') return null

  async function handlePay() {
    setPayError(null)
    setPaying(true)
    try {
      await startDeveloperPayment()
      // startDeveloperPayment() redirects the whole page on success, so
      // code after this line only runs if it threw.
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Payment শুরু করা যায়নি।')
      setPaying(false)
    }
  }

  return (
    <div className="rounded-card border border-signal-amber/30 bg-signal-amber/10 p-4 text-sm">
      <p className="mb-3">
        App publish করতে {settings.developerFeeAmount} {settings.developerFeeCurrency} একবারের
        publishing fee দিতে হবে (bKash/Nagad/Card — সব SSLCommerz দিয়ে)।
      </p>
      {payError && <p className="mb-2 text-signal-red">{payError}</p>}
      <button
        onClick={handlePay}
        disabled={paying}
        className="rounded-card bg-brand-500 px-4 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
      >
        {paying ? 'পাঠানো হচ্ছে…' : `${settings.developerFeeAmount} ${settings.developerFeeCurrency} পে করুন`}
      </button>
    </div>
  )
}

function PaymentReturnBanner({
  status,
  developerId,
  onDismiss,
}: {
  status: string
  developerId: string
  onDismiss: () => void
}) {
  const [failureInfo, setFailureInfo] = useState<{ reason: string | null; attemptNumber: number } | null>(null)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    if (status === 'fail') {
      fetchLatestFailureReason(developerId).then(setFailureInfo)
    }
  }, [status, developerId])

  async function handleRetry() {
    setRetrying(true)
    try {
      await startDeveloperPayment() // redirects the browser away on success — no need to reset `retrying`
    } catch (err) {
      setRetrying(false)
      alert(err instanceof Error ? err.message : 'Payment শুরু করা যায়নি।')
    }
  }

  const content: Record<string, { text: string; className: string }> = {
    success: {
      text: '✅ Payment সফল হয়েছে! কনফার্ম হতে কয়েক সেকেন্ড লাগতে পারে — না দেখালে একটু অপেক্ষা করো।',
      className: 'border-signal-green/30 bg-signal-green/10 text-signal-green',
    },
    fail: {
      // #40 — a specific reason when we have one, instead of always the
      // same generic line regardless of what actually went wrong. Also
      // shows which attempt this was, so "3rd time failing" reads
      // differently from "first try" (worth knowing before just hitting
      // retry again with no other change).
      text: failureInfo?.reason
        ? `❌ Payment ব্যর্থ হয়েছে (${failureInfo.attemptNumber === 1 ? 'প্রথম চেষ্টা' : `${failureInfo.attemptNumber} নম্বর চেষ্টা`}) — কারণ: ${failureInfo.reason}`
        : '❌ Payment ব্যর্থ হয়েছে।',
      className: 'border-signal-red/30 bg-signal-red/10 text-signal-red',
    },
    cancel: {
      text: 'Payment বাতিল করা হয়েছে।',
      className: 'border-ink/15 bg-ink/5 text-ink/70',
    },
  }
  const item = content[status]
  if (!item) return null

  return (
    <div className={`flex items-center justify-between gap-3 rounded-card border p-3 text-sm ${item.className}`}>
      <span>{item.text}</span>
      <div className="flex shrink-0 items-center gap-3">
        {status === 'fail' && (
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="rounded-card bg-signal-red px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            {retrying ? 'শুরু হচ্ছে…' : 'আবার চেষ্টা করো'}
          </button>
        )}
        <button onClick={onDismiss} className="underline">
          বন্ধ করো
        </button>
      </div>
    </div>
  )
}
