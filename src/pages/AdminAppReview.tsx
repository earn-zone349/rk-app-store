import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchAppForReview, performAdminAction, type AdminAppRow, type AdminAction } from '@/services/admin'
import type { AppVersion } from '@/types'
import PermissionsList from '@/components/PermissionsList'
import { SCAN_STATUS_LABEL } from '@/utils/scanStatusLabel'

export default function AdminAppReview() {
  const { appId } = useParams<{ appId: string }>()
  const navigate = useNavigate()

  const [app, setApp] = useState<AdminAppRow | null>(null)
  const [versions, setVersions] = useState<AppVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [reason, setReason] = useState('')
  const [pendingAction, setPendingAction] = useState<AdminAction | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!appId) return
    fetchAppForReview(appId).then(({ app: a, versions: v }) => {
      setApp(a)
      setVersions(v)
      setLoading(false)
    })
  }, [appId])

  async function handleAction(action: AdminAction) {
    if (!appId) return
    setError(null)

    if ((action === 'reject' || action === 'suspend') && !reason.trim()) {
      setError('এই কাজটার জন্য একটা কারণ লিখতে হবে — developer সেটা দেখতে পাবে।')
      return
    }

    setPendingAction(action)
    try {
      const result = await performAdminAction(appId, action, reason.trim() || undefined)
      if (!result.ok) {
        setError(result.error ?? 'Action সফল হয়নি।')
        return
      }
      navigate('/admin/apps')
    } finally {
      setPendingAction(null)
    }
  }

  if (loading) return <p className="text-sm text-ink/50">লোড হচ্ছে…</p>
  if (!app) return <p className="text-sm text-signal-red">App পাওয়া যায়নি।</p>

  const latestVersion = versions[0]
  const scan = latestVersion ? SCAN_STATUS_LABEL[latestVersion.securityStatus] : null

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-start gap-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-card bg-ink/5">
          {app.iconUrl && <img src={app.iconUrl} alt="" className="h-full w-full object-cover" />}
        </div>
        <div>
          <h1 className="text-xl font-semibold">{app.name}</h1>
          <p className="text-sm text-ink/50">
            {app.developer.developerName}
            {app.developer.verified && ' ✓ verified'}
            {app.developer.supportEmail && ` · ${app.developer.supportEmail}`}
          </p>
        </div>
      </div>

      <Section title="বিবরণ">
        <p className="text-sm text-ink/50 italic">{app.shortDescription}</p>
        <p className="mt-2 whitespace-pre-wrap text-sm">{app.description}</p>
      </Section>

      {app.screenshots.length > 0 && (
        <Section title="Screenshot">
          <div className="flex gap-2 overflow-x-auto">
            {app.screenshots.map((url) => (
              <img key={url} src={url} alt="" className="h-40 w-auto shrink-0 rounded-card border border-ink/10" />
            ))}
          </div>
        </Section>
      )}

      <Section title={`সর্বশেষ Version${latestVersion ? ` — ${latestVersion.versionName}` : ''}`}>
        {!latestVersion ? (
          <p className="text-sm text-ink/50">কোনো version আপলোড হয়নি।</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {scan && <span className={`rounded-full px-3 py-1 text-xs font-medium ${scan.className}`}>{scan.text}</span>}
              <span className="text-ink/50">
                {(latestVersion.apkSizeBytes / 1024 / 1024).toFixed(1)} MB · Android {latestVersion.minAndroid}+
              </span>
            </div>

            {latestVersion.packageName && (
              <p className="text-xs text-ink/50">
                package: <code>{latestVersion.packageName}</code>
                {latestVersion.minSdkExtracted && ` · minSdk ${latestVersion.minSdkExtracted}`}
                {latestVersion.targetSdkExtracted && ` · targetSdk ${latestVersion.targetSdkExtracted}`}
              </p>
            )}

            {latestVersion.scanResult && (
              <p className="text-xs text-ink/50">
                VirusTotal: {latestVersion.scanResult.malicious} malicious, {latestVersion.scanResult.suspicious}{' '}
                suspicious, {latestVersion.scanResult.harmless} harmless ({latestVersion.scanResult.undetected}{' '}
                undetected)
              </p>
            )}

            <div>
              <p className="mb-1 text-xs font-medium text-ink/60">Permissions:</p>
              <PermissionsList permissions={latestVersion.permissions ?? []} />
            </div>

            <a
              href={latestVersion.apkUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-brand-600 underline"
            >
              APK ফাইল ডাউনলোড করে টেস্ট করো →
            </a>
          </div>
        )}
      </Section>

      <Section title="সিদ্ধান্ত">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="কারণ (reject/suspend করলে দরকার — developer এটা দেখতে পাবে)"
          rows={2}
          className="mb-3 w-full rounded-card border border-ink/15 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />

        {error && <p className="mb-3 text-sm text-signal-red">{error}</p>}

        <div className="flex flex-wrap gap-2">
          {(app.status === 'pending' || app.status === 'rejected' || app.status === 'suspended') && (
            <ActionButton
              label={app.status === 'pending' ? '✓ Approve করো' : '✓ পুনরায় Approve করো'}
              className="bg-signal-green text-white hover:bg-signal-green/90"
              busy={pendingAction === 'approve'}
              disabled={pendingAction !== null}
              onClick={() => handleAction('approve')}
            />
          )}
          {app.status === 'pending' && (
            <ActionButton
              label="✕ Reject করো"
              className="bg-signal-red text-white hover:bg-signal-red/90"
              busy={pendingAction === 'reject'}
              disabled={pendingAction !== null}
              onClick={() => handleAction('reject')}
            />
          )}
          {app.status === 'approved' && (
            <ActionButton
              label="⏸ Suspend করো"
              className="border border-signal-amber text-signal-amber hover:bg-signal-amber/10"
              busy={pendingAction === 'suspend'}
              disabled={pendingAction !== null}
              onClick={() => handleAction('suspend')}
            />
          )}
          <ActionButton
            label={app.featured ? '★ Featured সরাও' : '☆ Featured করো'}
            className="border border-ink/15 text-ink/70 hover:bg-ink/5"
            busy={pendingAction === 'feature' || pendingAction === 'unfeature'}
            disabled={pendingAction !== null}
            onClick={() => handleAction(app.featured ? 'unfeature' : 'feature')}
          />
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-sm font-medium text-ink/70">{title}</h2>
      {children}
    </div>
  )
}

function ActionButton({
  label,
  className,
  busy,
  disabled,
  onClick,
}: {
  label: string
  className: string
  busy: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-card px-4 py-2 text-sm font-medium disabled:opacity-50 ${className}`}
    >
      {busy ? '...' : label}
    </button>
  )
}
