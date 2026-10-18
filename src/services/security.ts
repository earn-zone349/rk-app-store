import { supabase } from '@/lib/supabaseClient'

/**
 * Phase 6, step 44: duplicate detection.
 *
 * 0007_security_columns.sql already makes sha256 unique at the database
 * level — this function exists so the UI can give a clear message *before*
 * attempting the upload, instead of the developer only finding out after
 * uploading a 150MB file and hitting a raw constraint-violation error.
 *
 * Only checks apps the current developer can already see via RLS (their
 * own apps + approved apps) — which is exactly right: a duplicate of
 * someone else's still-pending app isn't visible here, but it will still
 * be caught by the database constraint at insert time either way.
 */
export async function findDuplicateBySha256(sha256: string): Promise<{ appName: string } | null> {
  const { data, error } = await supabase
    .from('app_versions')
    .select('app_id, apps(name)')
    .eq('sha256', sha256)
    .limit(1)
    .maybeSingle()

  if (error) {
    // Not fatal — worst case the developer finds out at insert time
    // instead, via the unique constraint. Don't block the upload flow on
    // a failed read-only pre-check.
    console.warn('duplicate check failed:', error)
    return null
  }
  if (!data) return null

  const appRow = data.apps as unknown as { name?: string } | { name?: string }[] | null
  const appName = Array.isArray(appRow) ? appRow[0]?.name : appRow?.name
  return { appName: appName ?? 'একটা আগের app' }
}

/**
 * Phase 6, step 45 & 48: kicks off (or checks on) a VirusTotal scan for an
 * already-uploaded app version. Calls the virustotal-scan Edge Function —
 * actual scanning/API-key usage happens server-side (see that function's
 * comments for why this can't run from the browser).
 */
export type ScanAction = 'start' | 'poll'

export interface ScanResponse {
  status: 'scanning' | 'clean' | 'flagged' | 'error'
  detail?: string
  stats?: { malicious: number; suspicious: number; harmless: number; undetected: number }
}

export async function runVirusScan(appVersionId: string, action: ScanAction): Promise<ScanResponse> {
  const { data, error } = await supabase.functions.invoke<ScanResponse>('virustotal-scan', {
    body: { appVersionId, action },
  })

  if (error) {
    return { status: 'error', detail: 'Scan সার্ভিসে পৌঁছানো যায়নি — একটু পরে আবার চেষ্টা করো।' }
  }
  return data ?? { status: 'error', detail: 'Scan থেকে কোনো উত্তর পাওয়া যায়নি।' }
}

/**
 * Phase 6, step 51: rate limiting from the client side. Calls the
 * check_rate_limit() Postgres function added in 0008_rate_limiting.sql.
 * `identifier` should be something stable per-caller — the developer's own
 * id for authenticated actions (add app, add version), since a real IP
 * address isn't reliably available in browser JS (see rate-limit-check
 * Edge Function for the IP-based version used on signup, before a user id
 * exists).
 */
export async function checkClientRateLimit(
  action: string,
  identifier: string,
  maxCount: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_key: `${action}:${identifier}`,
    p_max_count: maxCount,
    p_window_seconds: windowSeconds,
  })

  if (error) {
    // Fail open on the *client-side* convenience check — the real backstop
    // for anything security-sensitive should be server-side (RLS, or the
    // Edge Function's own IP-based check). This one is UX (stop obvious
    // accidental double-submits / scripted abuse early), not the last line
    // of defense.
    console.warn('rate limit check failed:', error)
    return true
  }
  return Boolean(data)
}
