import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { addAppVersion, fetchAppVersions, rollbackToVersion } from '@/services/appsDev'
import { uploadApk } from '@/services/storage'
import { sha256File } from '@/utils/hash'
import { validateApkFile } from '@/utils/apkValidation'
import { parseApkManifest, type ParsedManifest } from '@/utils/apkParser'
import { findDuplicateBySha256, runVirusScan, checkClientRateLimit } from '@/services/security'
import PermissionsList from '@/components/PermissionsList'
import { useAuth } from '@/context/AuthContext'
import type { AppVersion } from '@/types'

export default function AddAppVersion() {
  const { appId } = useParams<{ appId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [versionName, setVersionName] = useState('')
  const [versionCode, setVersionCode] = useState(2)
  const [minAndroid, setMinAndroid] = useState('8')
  const [releaseNotes, setReleaseNotes] = useState('')
  const [apkFile, setApkFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // #68 — version history + rollback, shown above the upload form.
  const [history, setHistory] = useState<AppVersion[]>([])
  const [rollingBackTo, setRollingBackTo] = useState<string | null>(null)

  useEffect(() => {
    if (!appId) return
    fetchAppVersions(appId).then(setHistory)
  }, [appId])

  async function handleRollback(versionId: string) {
    if (!appId) return
    setRollingBackTo(versionId)
    try {
      await rollbackToVersion(appId, versionId)
      setHistory(await fetchAppVersions(appId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rollback করা যায়নি।')
    } finally {
      setRollingBackTo(null)
    }
  }

  // Phase 6 — same file-level checks as AddApp.tsx (validity, duplicate
  // hash, extracted manifest/permissions), run the moment a file is picked.
  const [apkCheck, setApkCheck] = useState<
    | { state: 'idle' }
    | { state: 'checking' }
    | { state: 'invalid'; reason: string }
    | { state: 'duplicate'; appName: string }
    | { state: 'ok'; sha256: string; manifest: ParsedManifest | null }
  >({ state: 'idle' })

  async function handleApkFileChange(file: File | null) {
    setApkFile(file)
    setApkCheck({ state: 'idle' })
    if (!file) return

    setApkCheck({ state: 'checking' })

    const fileCheck = await validateApkFile(file)
    if (!fileCheck.ok) {
      setApkCheck({ state: 'invalid', reason: fileCheck.reason ?? 'অজানা কারণে এই ফাইলটা গ্রহণযোগ্য না।' })
      return
    }

    const sha256 = await sha256File(file)
    const duplicate = await findDuplicateBySha256(sha256)
    if (duplicate) {
      setApkCheck({ state: 'duplicate', appName: duplicate.appName })
      return
    }

    const manifest = await parseApkManifest(file)
    setApkCheck({ state: 'ok', sha256, manifest })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!appId) return
    if (!apkFile) {
      setError('APK ফাইল আপলোড করতে হবে।')
      return
    }
    if (apkCheck.state === 'invalid') {
      setError(apkCheck.reason)
      return
    }
    if (apkCheck.state === 'duplicate') {
      setError(`এই একই APK ফাইল আগে থেকেই "${apkCheck.appName}" app-এ আপলোড করা আছে।`)
      return
    }
    if (apkCheck.state !== 'ok') {
      setError('APK ফাইলটা এখনো যাচাই করা হচ্ছে — একটু অপেক্ষা করো।')
      return
    }

    const rateLimitId = user?.id ?? appId
    const allowed = await checkClientRateLimit('add_app_version', rateLimitId, 10, 3600)
    if (!allowed) {
      setError('অল্প সময়ের মধ্যে অনেকগুলো version submit করা হয়েছে — একটু পরে আবার চেষ্টা করো।')
      return
    }

    setSubmitting(true)
    try {
      const apkResult = await uploadApk(appId, versionCode, apkFile)
      const { sha256, manifest } = apkCheck

      const version = await addAppVersion({
        appId,
        versionName,
        versionCode,
        apkUrl: apkResult.url,
        apkSizeBytes: apkResult.sizeBytes,
        sha256,
        minAndroid,
        releaseNotes,
        magicValid: true,
        packageName: manifest?.packageName ?? undefined,
        versionNameExtracted: manifest?.versionName ?? undefined,
        versionCodeExtracted: manifest?.versionCode ?? undefined,
        minSdkExtracted: manifest?.minSdkVersion ?? undefined,
        targetSdkExtracted: manifest?.targetSdkVersion ?? undefined,
        permissions: manifest?.permissions ?? [],
      })

      // Fire-and-forget, same reasoning as AddApp.tsx.
      runVirusScan(version.id, 'start').catch(() => {})

      navigate('/developer')
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.toLowerCase().includes('row-level security') || message.toLowerCase().includes('permission')) {
        setError('নতুন version যোগ করা যায়নি — publishing এই মুহূর্তে খোলা নেই।')
      } else if (message.toLowerCase().includes('duplicate key') || message.toLowerCase().includes('unique constraint')) {
        setError('এই version code আগেই ব্যবহার হয়ে গেছে — এর চেয়ে বড় একটা সংখ্যা দাও।')
      } else {
        setError(message || 'Version যোগ করা যায়নি।')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-xl font-semibold">নতুন Version আপলোড করুন</h1>

      {history.length > 0 && (
        <div className="mb-8 rounded-card border border-ink/10 bg-ink/[0.02] p-4">
          <p className="mb-2 text-sm font-medium text-ink/70">Version History</p>
          <div className="flex flex-col gap-1.5">
            {history.map((v) => (
              <div key={v.id} className="flex items-center justify-between text-sm">
                <span>
                  {v.versionName} (code {v.versionCode}) {v.isCurrent && <span className="text-signal-green">● Live</span>}
                </span>
                {!v.isCurrent && (
                  <button
                    type="button"
                    onClick={() => handleRollback(v.id)}
                    disabled={rollingBackTo !== null}
                    className="text-xs text-brand-600 underline disabled:opacity-50"
                  >
                    {rollingBackTo === v.id ? 'হচ্ছে…' : 'এটাকে Live করো'}
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink/40">
            কোনো version-এ সমস্যা হলে আগের একটা version-কে আবার Live করে দিতে পারো — নতুন করে আপলোড করা লাগবে না।
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm text-ink/70">Version নাম *</label>
          <input
            required
            value={versionName}
            onChange={(e) => setVersionName(e.target.value)}
            className="input"
            placeholder="যেমন: 1.1"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-ink/70">Version কোড * (আগেরটার চেয়ে বড় সংখ্যা)</label>
          <input
            required
            type="number"
            min={1}
            value={versionCode}
            onChange={(e) => setVersionCode(Number(e.target.value))}
            className="input"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-ink/70">সর্বনিম্ন Android ভার্সন *</label>
          <input
            required
            value={minAndroid}
            onChange={(e) => setMinAndroid(e.target.value)}
            className="input"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-ink/70">What's New (ঐচ্ছিক)</label>
          <textarea
            rows={3}
            value={releaseNotes}
            onChange={(e) => setReleaseNotes(e.target.value)}
            className="input"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-ink/70">APK ফাইল *</label>
          <input
            type="file"
            accept=".apk"
            required
            onChange={(e) => handleApkFileChange(e.target.files?.[0] ?? null)}
          />
        </div>

        {apkCheck.state === 'checking' && (
          <p className="text-sm text-ink/50">APK ফাইলটা যাচাই করা হচ্ছে (validity, duplicate, permissions)…</p>
        )}
        {apkCheck.state === 'invalid' && <p className="text-sm text-signal-red">{apkCheck.reason}</p>}
        {apkCheck.state === 'duplicate' && (
          <p className="text-sm text-signal-red">
            এই একই APK ফাইল আগে থেকেই "{apkCheck.appName}" app-এ আপলোড করা আছে — একটা নতুন ফাইল বাছাই করো।
          </p>
        )}
        {apkCheck.state === 'ok' && (
          <div className="rounded-card border border-ink/10 bg-ink/[0.02] p-4">
            <p className="mb-2 text-sm font-medium text-signal-green">✓ APK ফাইল বৈধ — এই permission-গুলো লাগবে:</p>
            {apkCheck.manifest ? (
              <PermissionsList permissions={apkCheck.manifest.permissions} />
            ) : (
              <p className="text-sm text-ink/50">
                Manifest থেকে বিস্তারিত তথ্য পড়া যায়নি — file হিসেবে বৈধ, তবে permission list দেখানো যাচ্ছে না।
              </p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-signal-red">{error}</p>}

        <button
          type="submit"
          disabled={submitting || apkCheck.state === 'checking'}
          className="rounded-card bg-brand-500 px-4 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {submitting ? 'আপলোড হচ্ছে…' : 'Version প্রকাশ করুন'}
        </button>
      </form>
    </div>
  )
}
