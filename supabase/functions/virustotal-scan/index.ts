// Supabase Edge Function (Deno). Deploy with:
//   supabase functions deploy virustotal-scan
// Secret needed:
//   supabase secrets set VIRUSTOTAL_API_KEY=xxxx
// (free VirusTotal account -> API key in your profile settings; free tier
// is rate-limited to 4 requests/minute and 500/day, which is fine for a
// store this size — see SECURITY_SETUP.md for how to get one.)
//
// WHY THIS RUNS SERVER-SIDE, NOT IN THE BROWSER:
//   1. The VirusTotal API key must never be visible in frontend code — any
//      key shipped to the browser is public the moment someone opens dev
//      tools, and could be drained of its daily quota by anyone.
//   2. Only this function (using the service_role key) is allowed to write
//      security_status/scan_result on app_versions — see the
//      app_versions_protect_security_columns trigger in
//      0007_security_columns.sql. A developer's own browser session
//      literally cannot write these columns even if it tried.
//
// TWO ACTIONS in one function (keeps deployment to a single command):
//   'start' — call once, right after an APK upload finishes. Checks if
//             VirusTotal already knows this exact file by hash (instant);
//             if not, uploads it and kicks off a new analysis.
//   'poll'  — call from the frontend every few seconds after 'start'
//             returns {status:'scanning'} with a scan_id, until it returns
//             a final clean/flagged/error status. Analysis usually takes
//             15-90 seconds on VirusTotal's end, which is longer than a
//             single Edge Function invocation should block for — hence
//             polling instead of one long-running request.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const VT_API_BASE = 'https://www.virustotal.com/api/v3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown) {
  // Same reasoning as sslcommerz-init: always 200 so supabase-js's
  // functions.invoke() reliably hands the body back to the caller instead
  // of collapsing it into a generic network error.
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface ScanStats {
  malicious: number
  suspicious: number
  harmless: number
  undetected: number
}

function statusFromStats(stats: ScanStats): 'clean' | 'flagged' {
  return stats.malicious > 0 || stats.suspicious > 0 ? 'flagged' : 'clean'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ status: 'error', detail: 'POST only' })
  }

  try {
    return await handleScanRequest(req)
  } catch (err) {
    console.error('virustotal-scan error:', err)
    return jsonResponse({ status: 'error', detail: 'একটা অপ্রত্যাশিত সমস্যা হয়েছে।' })
  }
})

async function handleScanRequest(req: Request): Promise<Response> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ status: 'error', detail: 'লগইন করা নেই।' })

  const { appVersionId, action } = (await req.json()) as { appVersionId?: string; action?: 'start' | 'poll' }
  if (!appVersionId || !action) {
    return jsonResponse({ status: 'error', detail: 'appVersionId ও action দুটোই দরকার।' })
  }

  const vtApiKey = Deno.env.get('VIRUSTOTAL_API_KEY')
  if (!vtApiKey) {
    return jsonResponse({ status: 'error', detail: 'VirusTotal এখনো configure করা হয়নি (VIRUSTOTAL_API_KEY secret সেট করা নেই)।' })
  }

  // Two clients on purpose:
  //  - `caller` uses the requester's own JWT, only to confirm they're
  //    signed in and to prove they own this app_version (via the existing
  //    "developers can view own app versions" RLS policy) before we spend
  //    API quota scanning on their behalf.
  //  - `service` (service_role) is the only client allowed to write the
  //    scan result, per the protection trigger.
  const caller = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const {
    data: { user },
  } = await caller.auth.getUser()
  if (!user) return jsonResponse({ status: 'error', detail: 'লগইন করা নেই।' })

  const { data: version, error: versionError } = await caller
    .from('app_versions')
    .select('id, sha256, apk_url, security_status, scan_id')
    .eq('id', appVersionId)
    .single()

  if (versionError || !version) {
    return jsonResponse({ status: 'error', detail: 'এই app version পাওয়া যায়নি বা এটা তোমার নয়।' })
  }

  if (action === 'start') {
    // Already resolved earlier (e.g. duplicate hash of a previously-scanned
    // file) — no need to burn API quota scanning the same bytes twice.
    if (version.security_status === 'clean' || version.security_status === 'flagged') {
      return jsonResponse({ status: version.security_status })
    }
    return await startScan(service, vtApiKey, version)
  }

  // action === 'poll'
  if (!version.scan_id) {
    return jsonResponse({ status: 'error', detail: 'কোনো scan শুরু হয়নি — আগে start করো।' })
  }
  return await pollScan(service, vtApiKey, version.id, version.scan_id)
}

async function startScan(
  service: ReturnType<typeof createClient>,
  vtApiKey: string,
  version: { id: string; sha256: string; apk_url: string },
) {
  await service.from('app_versions').update({ security_status: 'scanning' }).eq('id', version.id)

  // Step 1: ask VirusTotal if it already has a verdict for this exact
  // file, by hash — instant, and by far the common case once the store
  // has any traffic (most APKs aren't unique bytes VT has never seen).
  const lookup = await fetch(`${VT_API_BASE}/files/${version.sha256}`, {
    headers: { 'x-apikey': vtApiKey },
  })

  if (lookup.status === 200) {
    const lookupData = await lookup.json()
    const stats = lookupData?.data?.attributes?.last_analysis_stats as ScanStats | undefined
    if (stats) {
      const finalStatus = statusFromStats(stats)
      await service
        .from('app_versions')
        .update({ security_status: finalStatus, scan_result: stats, scanned_at: new Date().toISOString() })
        .eq('id', version.id)
      return jsonResponse({ status: finalStatus, stats })
    }
  }

  // Step 2: VirusTotal hasn't seen this file before — download it from our
  // own public storage and submit it for a fresh analysis.
  const apkResponse = await fetch(version.apk_url)
  if (!apkResponse.ok) {
    await service.from('app_versions').update({ security_status: 'error' }).eq('id', version.id)
    return jsonResponse({ status: 'error', detail: 'APK ফাইল ডাউনলোড করে scan-এ পাঠানো যায়নি।' })
  }
  const apkBlob = await apkResponse.blob()

  // VirusTotal's plain `POST /files` endpoint caps out at 32MB — this
  // store allows APKs up to 200MB (storage.ts), so anything over 32MB
  // needs a special upload URL instead, or VT silently rejects it. This
  // is the exact reason a "just call the upload endpoint" implementation
  // would quietly break on any real-sized app.
  const VT_DIRECT_UPLOAD_LIMIT = 32 * 1024 * 1024
  let uploadTarget = `${VT_API_BASE}/files`
  if (apkBlob.size > VT_DIRECT_UPLOAD_LIMIT) {
    const uploadUrlResponse = await fetch(`${VT_API_BASE}/files/upload_url`, {
      headers: { 'x-apikey': vtApiKey },
    })
    if (!uploadUrlResponse.ok) {
      await service.from('app_versions').update({ security_status: 'error' }).eq('id', version.id)
      return jsonResponse({ status: 'error', detail: 'বড় ফাইলের জন্য VirusTotal upload URL পাওয়া যায়নি।' })
    }
    const uploadUrlData = await uploadUrlResponse.json()
    uploadTarget = uploadUrlData.data as string
  }

  const form = new FormData()
  form.append('file', apkBlob, 'app.apk')

  const uploadResponse = await fetch(uploadTarget, {
    method: 'POST',
    headers: { 'x-apikey': vtApiKey },
    body: form,
  })

  if (uploadResponse.status === 429) {
    await service.from('app_versions').update({ security_status: 'error' }).eq('id', version.id)
    return jsonResponse({
      status: 'error',
      detail: 'VirusTotal-এর ফ্রি quota আজকের মতো শেষ (দিনে ৫০০টা / মিনিটে ৪টা) — কাল আবার চেষ্টা করো, অথবা paid tier নাও।',
    })
  }

  if (!uploadResponse.ok) {
    await service.from('app_versions').update({ security_status: 'error' }).eq('id', version.id)
    const text = await uploadResponse.text()
    console.error('VirusTotal upload failed:', uploadResponse.status, text)
    return jsonResponse({ status: 'error', detail: 'VirusTotal-এ ফাইল পাঠানো যায়নি।' })
  }

  const uploadData = await uploadResponse.json()
  const analysisId = uploadData?.data?.id as string | undefined
  if (!analysisId) {
    await service.from('app_versions').update({ security_status: 'error' }).eq('id', version.id)
    return jsonResponse({ status: 'error', detail: 'VirusTotal থেকে analysis id পাওয়া যায়নি।' })
  }

  await service.from('app_versions').update({ scan_id: analysisId }).eq('id', version.id)
  return jsonResponse({ status: 'scanning' })
}

async function pollScan(
  service: ReturnType<typeof createClient>,
  vtApiKey: string,
  versionId: string,
  analysisId: string,
) {
  const analysisResponse = await fetch(`${VT_API_BASE}/analyses/${analysisId}`, {
    headers: { 'x-apikey': vtApiKey },
  })

  if (!analysisResponse.ok) {
    return jsonResponse({ status: 'error', detail: 'VirusTotal থেকে scan status পাওয়া যায়নি।' })
  }

  const analysisData = await analysisResponse.json()
  const vtStatus = analysisData?.data?.attributes?.status as string | undefined
  const stats = analysisData?.data?.attributes?.stats as ScanStats | undefined

  if (vtStatus !== 'completed' || !stats) {
    return jsonResponse({ status: 'scanning' })
  }

  const finalStatus = statusFromStats(stats)
  await service
    .from('app_versions')
    .update({ security_status: finalStatus, scan_result: stats, scanned_at: new Date().toISOString() })
    .eq('id', versionId)

  return jsonResponse({ status: finalStatus, stats })
}
