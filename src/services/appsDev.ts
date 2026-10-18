import { supabase } from '@/lib/supabaseClient'
import type { AppListing, AppStatus, AppVersion } from '@/types'

export interface AppRow {
  id: string
  developer_id: string
  name: string
  slug: string
  short_description: string | null
  description: string | null
  category_id: string
  icon_url: string | null
  status: AppStatus
  status_reason: string | null
  featured: boolean
  rating: number | null
  rating_count: number | null
  download_count: number | null
  privacy_policy_url: string | null
  age_rating: '3+' | '12+' | '18+'
  created_at: string
  updated_at: string
  // Only present when explicitly joined (fetchMyApps currently does a plain
  // `select('*')`, so this stays undefined there — kept optional/typed as
  // unknown[] rather than `any` so this mapper stays reusable if a future
  // query does join screenshots in.
  screenshots?: Array<{ url: string } | string>
}

export function mapAppRow(row: AppRow): AppListing {
  return {
    id: row.id,
    developerId: row.developer_id,
    name: row.name,
    slug: row.slug,
    shortDescription: row.short_description ?? '',
    description: row.description ?? '',
    categoryId: row.category_id,
    iconUrl: row.icon_url ?? '',
    screenshots: (row.screenshots ?? []).map((s) => (typeof s === 'string' ? s : s.url)),
    status: row.status,
    statusReason: row.status_reason ?? undefined,
    featured: row.featured,
    rating: Number(row.rating ?? 0),
    ratingCount: row.rating_count ?? 0,
    downloadCount: row.download_count ?? 0,
    privacyPolicyUrl: row.privacy_policy_url ?? undefined,
    ageRating: row.age_rating,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || `app-${Date.now()}`
  )
}

/** All apps belonging to the current developer, any status (pending/approved/rejected/suspended). */
export async function fetchMyApps(developerId: string): Promise<AppListing[]> {
  const { data, error } = await supabase
    .from('apps')
    .select('*')
    .eq('developer_id', developerId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(mapAppRow)
}

export interface NewAppInput {
  developerId: string
  name: string
  shortDescription: string
  description: string
  categoryId: string
  iconUrl: string
  screenshotUrls: string[]
  privacyPolicyUrl?: string
  ageRating: '3+' | '12+' | '18+'
}

/**
 * Creates a new app row. If the developer isn't allowed to publish yet
 * (payment not enabled/paid, and not the store owner), the database itself
 * rejects this via the RLS policy in 0003_payment_gating.sql — Supabase
 * returns a permission error, which the caller should show as a friendly
 * "publishing isn't open yet" message rather than a raw error.
 */
export async function createApp(input: NewAppInput): Promise<AppListing> {
  const { data, error } = await supabase
    .from('apps')
    .insert({
      developer_id: input.developerId,
      name: input.name,
      slug: slugify(input.name),
      short_description: input.shortDescription,
      description: input.description,
      category_id: input.categoryId,
      icon_url: input.iconUrl,
      privacy_policy_url: input.privacyPolicyUrl || null,
      age_rating: input.ageRating,
      status: 'pending',
    })
    .select('*')
    .single()

  if (error) throw error

  if (input.screenshotUrls.length > 0) {
    const rows = input.screenshotUrls.map((url, i) => ({
      app_id: data.id,
      url,
      position: i,
    }))
    const { error: screenshotError } = await supabase.from('screenshots').insert(rows)
    if (screenshotError) throw screenshotError
  }

  return mapAppRow(data)
}

export interface NewVersionInput {
  appId: string
  versionName: string
  versionCode: number
  apkUrl: string
  apkSizeBytes: number
  sha256: string
  minAndroid: string
  releaseNotes?: string
  // Phase 6 — optional because parsing can legitimately fail (see
  // apkParser.ts) without blocking the upload; every field defaults to
  // null in the database when omitted.
  magicValid?: boolean
  packageName?: string
  versionNameExtracted?: string
  versionCodeExtracted?: number
  minSdkExtracted?: number
  targetSdkExtracted?: number
  permissions?: string[]
}

export function mapVersionRow(row: Record<string, unknown>): AppVersion {
  return {
    id: row.id as string,
    appId: row.app_id as string,
    versionName: row.version_name as string,
    versionCode: row.version_code as number,
    apkUrl: row.apk_url as string,
    apkSizeBytes: row.apk_size_bytes as number,
    sha256: row.sha256 as string,
    minAndroid: row.min_android as string,
    releaseNotes: (row.release_notes as string | null) ?? undefined,
    securityStatus: row.security_status as AppVersion['securityStatus'],
    createdAt: row.created_at as string,
    isCurrent: Boolean(row.is_current),
    packageName: (row.package_name as string | null) ?? undefined,
    minSdkExtracted: (row.min_sdk_extracted as number | null) ?? undefined,
    targetSdkExtracted: (row.target_sdk_extracted as number | null) ?? undefined,
    permissions: (row.permissions as string[] | null) ?? undefined,
    scanResult: (row.scan_result as AppVersion['scanResult'] | null) ?? undefined,
    scannedAt: (row.scanned_at as string | null) ?? undefined,
  }
}

/** Same payment gate as createApp, enforced by RLS on app_versions. */
export async function addAppVersion(input: NewVersionInput): Promise<AppVersion> {
  const { data, error } = await supabase
    .from('app_versions')
    .insert({
      app_id: input.appId,
      version_name: input.versionName,
      version_code: input.versionCode,
      apk_url: input.apkUrl,
      apk_size_bytes: input.apkSizeBytes,
      sha256: input.sha256,
      min_android: input.minAndroid,
      release_notes: input.releaseNotes || null,
      magic_valid: input.magicValid ?? null,
      package_name: input.packageName || null,
      version_name_extracted: input.versionNameExtracted || null,
      version_code_extracted: input.versionCodeExtracted ?? null,
      min_sdk_extracted: input.minSdkExtracted ?? null,
      target_sdk_extracted: input.targetSdkExtracted ?? null,
      permissions: input.permissions ?? [],
    })
    .select('*')
    .single()

  if (error) throw error

  // #68 — every newly uploaded version becomes the live one automatically
  // (matches how every real app store works: publish = it's now current).
  // set_current_app_version handles both "there was no current version yet"
  // (brand new app) and "there was one, unset it first" (a normal update)
  // the same way — see 0011_phase_gaps.sql for why that's safe.
  const { error: currentError } = await supabase.rpc('set_current_app_version', {
    p_app_id: input.appId,
    p_version_id: data.id,
  })
  if (currentError) throw currentError

  return mapVersionRow({ ...data, is_current: true })
}

export async function fetchAppVersions(appId: string): Promise<AppVersion[]> {
  const { data, error } = await supabase
    .from('app_versions')
    .select('*')
    .eq('app_id', appId)
    .order('version_code', { ascending: false })

  if (error) throw error
  return (data ?? []).map(mapVersionRow)
}

/** #68 — rollback: make an older, already-uploaded version live again. Same underlying function addAppVersion() calls automatically for a fresh upload. */
export async function rollbackToVersion(appId: string, versionId: string): Promise<void> {
  const { error } = await supabase.rpc('set_current_app_version', { p_app_id: appId, p_version_id: versionId })
  if (error) throw error
}
