import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { fetchMyDeveloperProfile } from '@/services/developers'
import { fetchAppSettings } from '@/services/settings'
import { fetchCategories } from '@/services/apps'
import { createApp, addAppVersion } from '@/services/appsDev'
import { uploadAppIcon, uploadScreenshot, uploadApk } from '@/services/storage'
import { sha256File } from '@/utils/hash'
import { validateApkFile } from '@/utils/apkValidation'
import { parseApkManifest, type ParsedManifest } from '@/utils/apkParser'
import { findDuplicateBySha256, runVirusScan, checkClientRateLimit } from '@/services/security'
import PermissionsList from '@/components/PermissionsList'
import type { Category, Developer } from '@/types'

export default function AddApp() {
  const navigate = useNavigate()
  const [developer, setDeveloper] = useState<Developer | null>(null)
  const [canPublish, setCanPublish] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [loadingContext, setLoadingContext] = useState(true)

  const [name, setName] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [ageRating, setAgeRating] = useState<'3+' | '12+' | '18+'>('3+')
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [screenshotFiles, setScreenshotFiles] = useState<File[]>([])
  const [apkFile, setApkFile] = useState<File | null>(null)
  const [versionName, setVersionName] = useState('1.0')
  const [versionCode, setVersionCode] = useState(1)
  const [minAndroid, setMinAndroid] = useState('8')

  // Phase 6: everything learned about the APK the moment it's selected,
  // before the "Submit for Review" button is even clickable — so a
  // developer finds out about an invalid file or a duplicate upload
  // immediately, not after waiting through a full upload.
  const [apkCheck, setApkCheck] = useState<
    | { state: 'idle' }
    | { state: 'checking' }
    | { state: 'invalid'; reason: string }
    | { state: 'duplicate'; appName: string }
    | { state: 'ok'; sha256: string; manifest: ParsedManifest | null }
  >({ state: 'idle' })

  const [step, setStep] = useState<'idle' | 'uploading-icon' | 'uploading-screenshots' | 'uploading-apk' | 'saving'>(
    'idle',
  )
  const [error, setError] = useState<string | null>(null)

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

    // Manifest parsing is best-effort enrichment (see apkParser.ts) — a
    // null result here still means "ok to upload," just without extracted
    // metadata/permissions to show.
    const manifest = await parseApkManifest(file)
    setApkCheck({ state: 'ok', sha256, manifest })
  }

  useEffect(() => {
    Promise.all([fetchMyDeveloperProfile(), fetchAppSettings(), fetchCategories()]).then(
      ([dev, settings, cats]) => {
        setDeveloper(dev)
        if (dev) setCanPublish(dev.isOwner || (settings.paymentEnabled && dev.paymentStatus === 'paid'))
        setCategories(cats)
        if (cats.length > 0) setCategoryId(cats[0].id)
        setLoadingContext(false)
      },
    )
  }, [])

  if (loadingContext) return <p className="text-sm text-ink/50">লোড হচ্ছে…</p>
  if (!developer) return <Navigate to="/developer/onboarding" replace />
  if (!canPublish) return <Navigate to="/developer" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!iconFile) {
      setError('App icon আপলোড করতে হবে।')
      return
    }
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

    const allowed = await checkClientRateLimit('add_app', developer!.id, 5, 3600)
    if (!allowed) {
      setError('অল্প সময়ের মধ্যে অনেকগুলো app submit করা হয়েছে — একটু পরে আবার চেষ্টা করো।')
      return
    }

    try {
      const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`

      setStep('uploading-icon')
      const iconUrl = await uploadAppIcon(slug, iconFile)

      setStep('uploading-screenshots')
      const screenshotUrls: string[] = []
      for (let i = 0; i < screenshotFiles.length; i++) {
        screenshotUrls.push(await uploadScreenshot(slug, screenshotFiles[i], i))
      }

      setStep('uploading-apk')
      const apkResult = await uploadApk(slug, versionCode, apkFile)
      const { sha256, manifest } = apkCheck

      setStep('saving')
      const app = await createApp({
        developerId: developer!.id,
        name,
        shortDescription,
        description,
        categoryId,
        iconUrl,
        screenshotUrls,
        ageRating,
      })

      const version = await addAppVersion({
        appId: app.id,
        versionName,
        versionCode,
        apkUrl: apkResult.url,
        apkSizeBytes: apkResult.sizeBytes,
        sha256,
        minAndroid,
        magicValid: true,
        packageName: manifest?.packageName ?? undefined,
        versionNameExtracted: manifest?.versionName ?? undefined,
        versionCodeExtracted: manifest?.versionCode ?? undefined,
        minSdkExtracted: manifest?.minSdkVersion ?? undefined,
        targetSdkExtracted: manifest?.targetSdkVersion ?? undefined,
        permissions: manifest?.permissions ?? [],
      })

      // Fire-and-forget: kicks off the VirusTotal scan but doesn't block
      // navigation on it — scanning can take up to ~90 seconds and the
      // developer shouldn't have to sit and watch it. AppDetails.tsx /
      // DeveloperDashboard.tsx poll the resulting security_status instead.
      runVirusScan(version.id, 'start').catch(() => {
        // Best-effort — if this particular call fails, the app still sits
        // at security_status='pending' and can be retried/scanned later;
        // it does not block the submission that already succeeded.
      })

      navigate('/developer')
    } catch (err) {
      setStep('idle')
      // A permission-denied error here almost always means the RLS payment
      // gate blocked the insert (see 0003_payment_gating.sql) — show that
      // plainly instead of a raw Postgres error string.
      const message = err instanceof Error ? err.message : ''
      if (message.toLowerCase().includes('row-level security') || message.toLowerCase().includes('permission')) {
        setError(
          'App publish করা যায়নি — এই মুহূর্তে publishing খোলা নেই বা তোমার publishing fee পরিশোধ হয়নি।',
        )
      } else {
        setError(message || 'App যোগ করা যায়নি।')
      }
    }
  }

  const stepLabel: Record<typeof step, string> = {
    idle: '',
    'uploading-icon': 'Icon আপলোড হচ্ছে…',
    'uploading-screenshots': 'Screenshot আপলোড হচ্ছে…',
    'uploading-apk': 'APK আপলোড হচ্ছে…',
    saving: 'সংরক্ষণ করা হচ্ছে…',
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-xl font-semibold">নতুন App যোগ করুন</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Field label="App-এর নাম *">
          <input
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
          />
        </Field>

        <Field label="সংক্ষিপ্ত বিবরণ (এক লাইনে) *">
          <input
            required
            maxLength={200}
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            className="input"
          />
        </Field>

        <Field label="বিস্তারিত বিবরণ *">
          <textarea
            required
            rows={4}
            maxLength={5000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input"
          />
        </Field>

        <Field label="Category *">
          <select
            required
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="input"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Age Rating *">
          <select required value={ageRating} onChange={(e) => setAgeRating(e.target.value as typeof ageRating)} className="input">
            <option value="3+">3+ — সবার জন্য</option>
            <option value="12+">12+ — হালকা সহিংসতা/ভয়ের উপাদান থাকতে পারে</option>
            <option value="18+">18+ — শুধু প্রাপ্তবয়স্কদের জন্য</option>
          </select>
        </Field>

        <Field label="App Icon (স্কয়ার ছবি) *">
          <input
            type="file"
            accept="image/*"
            required
            onChange={(e) => setIconFile(e.target.files?.[0] ?? null)}
          />
        </Field>

        <Field label="Screenshot (একাধিক বেছে নেওয়া যাবে)">
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setScreenshotFiles(Array.from(e.target.files ?? []))}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Version নাম *">
            <input
              required
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Version কোড *">
            <input
              required
              type="number"
              min={1}
              value={versionCode}
              onChange={(e) => setVersionCode(Number(e.target.value))}
              className="input"
            />
          </Field>
        </div>

        <Field label="সর্বনিম্ন Android ভার্সন *">
          <input
            required
            value={minAndroid}
            onChange={(e) => setMinAndroid(e.target.value)}
            className="input"
            placeholder="যেমন: 8"
          />
        </Field>

        <Field label="APK ফাইল *">
          <input
            type="file"
            accept=".apk"
            required
            onChange={(e) => handleApkFileChange(e.target.files?.[0] ?? null)}
          />
        </Field>

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
          disabled={step !== 'idle' || apkCheck.state === 'checking'}
          className="rounded-card bg-brand-500 px-4 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {step === 'idle' ? 'Submit for Review' : stepLabel[step]}
        </button>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm text-ink/70">{label}</label>
      {children}
    </div>
  )
}
