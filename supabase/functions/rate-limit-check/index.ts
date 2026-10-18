// Supabase Edge Function (Deno). Deploy with:
//   supabase functions deploy rate-limit-check --no-verify-jwt
//
// --no-verify-jwt is required: this has to work for someone who isn't
// signed in yet (they're trying to sign up, or log in) — there's no JWT to
// verify. The function protects itself differently, by only ever
// incrementing a bounded counter (see check_rate_limit() in
// 0008_rate_limiting.sql), never reading or writing anything else.
//
// WHY THIS CAN'T JUST BE A CLIENT-SIDE CALL TO check_rate_limit():
// security.ts's checkClientRateLimit() calls that same Postgres function
// directly from the browser for *authenticated* actions, keyed by the
// developer's own user id — reasonable there, since a signed-in user can't
// spoof a different user id to dodge their own limit. But for signup
// there's no user id yet; the only meaningful identifier is IP address,
// and a browser can't be trusted to report its own IP honestly. This Edge
// Function reads the real client IP from the request headers Supabase's
// edge network sets, which the browser has no way to fake.

import { createClient } from 'jsr:@supabase/supabase-js@2'

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

// Conservative defaults per action — tune in SECURITY_SETUP.md if these
// turn out too strict/loose once the store has real traffic.
const LIMITS: Record<string, { maxCount: number; windowSeconds: number }> = {
  signup: { maxCount: 5, windowSeconds: 3600 }, // 5 signup attempts/hour/IP
  login: { maxCount: 10, windowSeconds: 900 }, // 10 login attempts/15min/IP
  password_reset: { maxCount: 3, windowSeconds: 3600 }, // 3 reset emails/hour/IP
  report_app: { maxCount: 10, windowSeconds: 3600 }, // 10 report submissions/hour/IP
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ allowed: false, error: 'POST only' })

  try {
    const { action } = (await req.json()) as { action?: string }
    const limit = action ? LIMITS[action] : undefined
    if (!limit) {
      return jsonResponse({ allowed: false, error: `অজানা action: ${action ?? '(খালি)'}` })
    }

    // x-forwarded-for can contain a comma-separated chain of proxies; the
    // first entry is the original client. Falls back to a fixed string
    // only in local dev where Supabase's edge network isn't in front of
    // the request at all (never happens in production).
    const forwardedFor = req.headers.get('x-forwarded-for')
    const ip = forwardedFor?.split(',')[0]?.trim() || 'unknown'

    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data, error } = await service.rpc('check_rate_limit', {
      p_key: `${action}:${ip}`,
      p_max_count: limit.maxCount,
      p_window_seconds: limit.windowSeconds,
    })

    if (error) {
      console.error('rate-limit-check error:', error)
      // Fail open rather than locking everyone out if the counter table
      // itself has a problem — a broken rate limiter shouldn't take the
      // whole signup flow down with it.
      return jsonResponse({ allowed: true })
    }

    return jsonResponse({ allowed: Boolean(data) })
  } catch (err) {
    console.error('rate-limit-check error:', err)
    return jsonResponse({ allowed: true })
  }
})
