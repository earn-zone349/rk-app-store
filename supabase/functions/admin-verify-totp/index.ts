// Supabase Edge Function (Deno). Deploy with:
//   supabase functions deploy admin-verify-totp
//
// WHAT THIS DOES AND DOESN'T PROTECT AGAINST (read this before relying on
// it — see ADMIN_SETUP.md for the fuller version):
//   - AdminLogin.tsx calls this after a normal Supabase email/password
//     sign-in succeeds, before showing the admin UI. If the code checks
//     out, the frontend sets a sessionStorage flag and RequireAdmin.tsx
//     lets them through to the admin pages.
//   - The REAL authorization boundary — the thing that actually stops a
//     non-admin from approving/rejecting apps — is the is_admin() check
//     inside the admin-action Edge Function and the RLS policies from
//     0009_admin_system.sql, not this sessionStorage flag. Someone who
//     somehow got a valid Supabase session for an admin's account without
//     going through AdminLogin.tsx (e.g. calling supabase-js directly)
//     would still be blocked from doing anything by those, TOTP or not.
//   - What TOTP actually buys you: if an admin's password leaks (phishing,
//     reused password, etc.), an attacker with just the password still
//     can't get past this screen without the admin's physical
//     authenticator device. That's the whole point of a second factor.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { verifyTotpCode } from '../_shared/totp.ts'

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
  if (req.method !== 'POST') return jsonResponse({ verified: false, error: 'POST only' })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ verified: false, error: 'লগইন করা নেই।' })

    const { code } = (await req.json()) as { code?: string }
    if (!code) return jsonResponse({ verified: false, error: 'কোড দাও।' })

    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const {
      data: { user },
    } = await caller.auth.getUser()
    if (!user) return jsonResponse({ verified: false, error: 'লগইন করা নেই।' })

    // Rate-limit TOTP attempts (reuses the same counter table/function
    // from Phase 6) — a 6-digit code has only a million combinations,
    // brute-forcing it is entirely feasible without this.
    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: allowed } = await service.rpc('check_rate_limit', {
      p_key: `admin_totp:${user.id}`,
      p_max_count: 5,
      p_window_seconds: 300, // 5 tries per 5 minutes per account
    })
    if (!allowed) {
      return jsonResponse({ verified: false, error: 'অনেকবার ভুল কোড দেওয়া হয়েছে — ৫ মিনিট পরে আবার চেষ্টা করো।' })
    }

    const { data: admin, error: adminError } = await service
      .from('admins')
      .select('totp_secret')
      .eq('user_id', user.id)
      .maybeSingle()

    if (adminError || !admin) {
      // Same message whether the account doesn't exist or isn't an admin —
      // no reason to let this endpoint confirm/deny "is this email an
      // admin" to whoever's calling it.
      return jsonResponse({ verified: false, error: 'ভুল কোড বা এই account admin না।' })
    }

    const verified = await verifyTotpCode(admin.totp_secret, code)
    return jsonResponse({ verified, error: verified ? undefined : 'ভুল কোড — আবার চেষ্টা করো।' })
  } catch (err) {
    console.error('admin-verify-totp error:', err)
    return jsonResponse({ verified: false, error: 'একটা অপ্রত্যাশিত সমস্যা হয়েছে।' })
  }
})
