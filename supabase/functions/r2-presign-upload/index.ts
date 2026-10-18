// Supabase Edge Function (Deno). Deploy with:
//   supabase functions deploy r2-presign-upload
//
// WHY A PRESIGNED URL INSTEAD OF UPLOADING THROUGH THIS FUNCTION:
// Edge Functions have a request-body size limit well under what a 200MB
// APK needs — routing the file itself through here would fail before it
// even reached R2. The standard pattern for large-file browser uploads to
// S3-compatible storage (R2 speaks the same API) is: ask a trusted server
// for a short-lived, pre-signed URL, then have the BROWSER upload
// straight to storage using that URL. This function only ever signs a
// URL — the actual file bytes never pass through Supabase at all.
//
// Uses aws4fetch (via npm: specifier) for the AWS Signature V4 signing R2
// requires — this is the exact library Cloudflare's own R2 presigned-URL
// documentation uses, chosen over hand-rolling SigV4 (easy to get subtly
// wrong) or the full aws-sdk (heavyweight, built for Node, not Deno/edge).

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { AwsClient } from 'npm:aws4fetch@1.0.20'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'লগইন করা নেই।' })

    const { slug, versionCode, fileSizeBytes } = (await req.json()) as {
      slug?: string
      versionCode?: number
      fileSizeBytes?: number
    }
    if (!slug || !versionCode) {
      return jsonResponse({ error: 'slug ও versionCode দুটোই দরকার।' })
    }
    // Same 200MB ceiling storage.ts always enforced — checked again here
    // since this function decides the final path/URL, not just storage.ts.
    if (typeof fileSizeBytes === 'number' && fileSizeBytes > 200 * 1024 * 1024) {
      return jsonResponse({ error: 'APK ফাইল ২০০ MB-এর বেশি হতে পারবে না।' })
    }

    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const {
      data: { user },
    } = await caller.auth.getUser()
    if (!user) return jsonResponse({ error: 'লগইন করা নেই।' })

    // Reuses the same rate-limit counter/function every other Edge
    // Function in this app uses (0008_rate_limiting.sql) — 20 upload URLs
    // per hour per developer is generous for legitimate use (nobody
    // publishes 20 APKs an hour) and blocks a compromised/scripted
    // account from hammering R2 for free storage.
    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: allowed } = await service.rpc('check_rate_limit', {
      p_key: `r2_presign:${user.id}`,
      p_max_count: 20,
      p_window_seconds: 3600,
    })
    if (!allowed) {
      return jsonResponse({ error: 'অল্প সময়ে অনেকগুলো upload request হয়েছে — একটু পরে আবার চেষ্টা করো।' })
    }

    const accountId = Deno.env.get('R2_ACCOUNT_ID')
    const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')
    const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
    const bucket = Deno.env.get('R2_BUCKET_NAME')
    const publicBaseUrl = Deno.env.get('R2_PUBLIC_URL')
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
      return jsonResponse({ error: 'R2 এখনো configure করা হয়নি — R2_SETUP.md দ্রষ্টব্য।' })
    }

    // Path includes the uploader's own user id as the first segment —
    // same per-user-folder convention as the developer-ids private bucket
    // (0011_phase_gaps.sql) — an audit trail of who uploaded what, even
    // though the bucket itself is publicly readable for downloads.
    const safeSlug = slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
    const key = `apks/${user.id}/${safeSlug}-v${versionCode}-${Date.now()}.apk`

    const objectUrl = new URL(`https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`)
    // SigV4 presigned URLs read their expiry from this query param at
    // signing time (this is the correct aws4fetch pattern — Cloudflare's
    // own R2 presigned-URL docs set it exactly this way, not as a
    // separate `sign()` option). 600s = 10 minutes, plenty for a direct
    // upload, short enough a leaked URL isn't a standing risk.
    objectUrl.searchParams.set('X-Amz-Expires', '600')

    const s3Client = new AwsClient({
      accessKeyId,
      secretAccessKey,
      region: 'auto', // R2 doesn't have real AWS regions — "auto" is what R2 expects here
      service: 's3',
    })

    const signedRequest = await s3Client.sign(
      new Request(objectUrl, {
        method: 'PUT',
        headers: { 'content-type': 'application/vnd.android.package-archive' },
      }),
      { aws: { signQuery: true } },
    )

    return jsonResponse({
      uploadUrl: signedRequest.url,
      publicUrl: `${publicBaseUrl.replace(/\/$/, '')}/${key}`,
      path: key,
    })
  } catch (err) {
    console.error('r2-presign-upload error:', err)
    return jsonResponse({ error: 'একটা অপ্রত্যাশিত সমস্যা হয়েছে।' })
  }
})
