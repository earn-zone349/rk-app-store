import { supabase } from '@/lib/supabaseClient'
import { compressIcon, compressImage } from '@/utils/imageCompress'

/**
 * --- APK hosting strategy (Phase 3 step 20, migrated per Phase 11) ------
 *
 * APKs now upload directly to Cloudflare R2 (S3-compatible, no egress
 * fees), never touching Supabase Storage — see R2_SETUP.md for the
 * one-time setup and r2-presign-upload/index.ts for why this needs a
 * presigned-URL flow rather than a direct client library call the way
 * icons/screenshots below still do.
 *
 * Deliberately migrated ALL AT ONCE rather than "new APKs go to R2, old
 * ones stay on Supabase" — a store with APKs split across two storage
 * backends is strictly worse than either option alone: every future
 * change (CDN config, cache rules, a future re-migration) has to handle
 * both cases forever. Since this migration happened before any real apps
 * were live, there was nothing to backfill — if you're reading this after
 * real production data exists, migrating a system with a mix of old/new
 * storage locations is a different, harder problem than this comment
 * covers.
 *
 * Icons and screenshots stay on Supabase Storage regardless of scale;
 * they're compressed (see imageCompress.ts) and small enough that egress
 * cost is a non-issue — no reason to add R2's complexity for those.
 * ------------------------------------------------------------------------
 */

const ICONS_BUCKET = 'icons'
const SCREENSHOTS_BUCKET = 'screenshots'

function publicUrl(bucket: string, path: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

export async function uploadAppIcon(appSlug: string, file: File): Promise<string> {
  const compressed = await compressIcon(file)
  const path = `${appSlug}/icon-${Date.now()}.webp`
  const { error } = await supabase.storage.from(ICONS_BUCKET).upload(path, compressed, {
    contentType: compressed.type,
    upsert: true,
  })
  if (error) throw error
  return publicUrl(ICONS_BUCKET, path)
}

export async function uploadScreenshot(appSlug: string, file: File, index: number): Promise<string> {
  const compressed = await compressImage(file, { maxWidth: 1600, maxHeight: 1600 })
  const path = `${appSlug}/screenshot-${index}-${Date.now()}.webp`
  const { error } = await supabase.storage.from(SCREENSHOTS_BUCKET).upload(path, compressed, {
    contentType: compressed.type,
    upsert: true,
  })
  if (error) throw error
  return publicUrl(SCREENSHOTS_BUCKET, path)
}

export interface ApkUploadResult {
  url: string
  path: string
  sizeBytes: number
}

export async function uploadApk(appSlug: string, versionCode: number, file: File): Promise<ApkUploadResult> {
  if (!file.name.toLowerCase().endsWith('.apk')) {
    throw new Error('শুধু .apk ফাইল আপলোড করা যাবে।')
  }
  // Hard upload-size ceiling — fine-grained validation (signature, hash,
  // malware scan) is Phase 6's job; this is just a first gate against
  // obviously-wrong files. Checked again server-side in
  // r2-presign-upload, since a client-side check alone is only a UX
  // nicety, never the real enforcement.
  const MAX_SIZE = 200 * 1024 * 1024 // 200 MB
  if (file.size > MAX_SIZE) {
    throw new Error('APK ফাইল ২০০ MB-এর বেশি হতে পারবে না।')
  }

  // Step 1: ask r2-presign-upload for a short-lived signed URL — it
  // decides the final storage path (keyed by the uploader's own user id),
  // this function never constructs that path itself.
  const { data, error: presignError } = await supabase.functions.invoke<{
    uploadUrl?: string
    publicUrl?: string
    path?: string
    error?: string
  }>('r2-presign-upload', {
    body: { slug: appSlug, versionCode, fileSizeBytes: file.size },
  })

  if (presignError) throw new Error('Upload URL পাওয়া যায়নি — একটু পরে আবার চেষ্টা করো।')
  if (!data?.uploadUrl || !data.publicUrl || !data.path) {
    throw new Error(data?.error ?? 'Upload URL পাওয়া যায়নি।')
  }

  // Step 2: upload the actual bytes STRAIGHT to R2 — this fetch call goes
  // to Cloudflare, never to Supabase or any server of ours, which is the
  // entire point of the presigned-URL pattern (no edge function
  // body-size limit to hit on a 200MB file).
  const uploadResponse = await fetch(data.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'application/vnd.android.package-archive' },
    body: file,
  })
  if (!uploadResponse.ok) {
    throw new Error('APK ফাইল R2-তে আপলোড করা যায়নি।')
  }

  return { url: data.publicUrl, path: data.path, sizeBytes: file.size }
}
