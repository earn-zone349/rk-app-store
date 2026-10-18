// Supabase Edge Function (Deno). Deploy with:
//   supabase functions deploy admin-enroll
//
// Only callable BY an existing admin (checked below) — this is the
// "add a second admin" path once the store has grown past one person.
// The very first admin can only come from bootstrap_first_admin() in
// 0009_admin_system.sql, run by hand in the SQL editor — see
// ADMIN_SETUP.md. There is no UI screen that calls this function shipped
// in Phase 7; it exists for you to call once (via curl or the Supabase
// dashboard's function-testing panel) when you're ready to add a second
// admin, and is intentionally not linked from anywhere in the admin
// navigation — adding an admin should be a deliberate, rare action, not a
// button someone can click by accident.

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

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let secret = ''
  for (const b of bytes) secret += BASE32_ALPHABET[b % 32]
  return secret
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'লগইন করা নেই।' })

    const { email, label } = (await req.json()) as { email?: string; label?: string }
    if (!email || !label) return jsonResponse({ error: 'email ও label দুটোই দরকার।' })

    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const {
      data: { user },
    } = await caller.auth.getUser()
    if (!user) return jsonResponse({ error: 'লগইন করা নেই।' })

    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: callerIsAdmin } = await service.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
    if (!callerIsAdmin) {
      return jsonResponse({ error: 'শুধু বিদ্যমান admin-রাই নতুন admin যোগ করতে পারে।' })
    }

    // service_role can read auth.users directly (it's a schema Supabase
    // manages, not one of our own tables) — this is the standard way to
    // resolve an email to a user id from server-side code. listUsers() is
    // paginated (defaults to ~50/page) — a naive single call would quietly
    // fail to find anyone once the store has more users than that, so this
    // pages through until it finds a match or genuinely runs out of users.
    let targetUserId: string | null = null
    for (let page = 1; page <= 50 && !targetUserId; page++) {
      const { data: userPage, error: userError } = await service.auth.admin.listUsers({ page, perPage: 1000 })
      if (userError) return jsonResponse({ error: 'User list পড়া যায়নি।' })
      const match = userPage.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
      if (match) targetUserId = match.id
      if (userPage.users.length < 1000) break // last page
    }

    if (!targetUserId) {
      return jsonResponse({ error: `এই email-এ কোনো account নেই: ${email} — আগে ওই email দিয়ে সাধারণ signup করতে হবে।` })
    }

    const secret = generateSecret()
    const { error: insertError } = await service
      .from('admins')
      .insert({ user_id: targetUserId, label, totp_secret: secret })

    if (insertError) {
      if (insertError.code === '23505') return jsonResponse({ error: 'এই ব্যক্তি ইতিমধ্যে admin।' })
      return jsonResponse({ error: 'Admin যোগ করা যায়নি।' })
    }

    await service.from('audit_log').insert({
      admin_id: user.id,
      action: 'enroll_admin',
      target_type: 'admin',
      target_id: targetUserId,
      reason: `নতুন admin যোগ: ${label} (${email})`,
    })

    return jsonResponse({
      totpSecret: secret,
      otpauthUri: `otpauth://totp/RK%20App%20Store:${encodeURIComponent(email)}?secret=${secret}&issuer=RK%20App%20Store`,
    })
  } catch (err) {
    console.error('admin-enroll error:', err)
    return jsonResponse({ error: 'একটা অপ্রত্যাশিত সমস্যা হয়েছে।' })
  }
})
