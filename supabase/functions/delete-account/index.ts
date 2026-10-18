// Supabase Edge Function (Deno). Deploy with:
//   supabase functions deploy delete-account
//
// WHY THIS CAN'T BE A CLIENT-SIDE CALL: deleting an auth.users row
// requires the Auth Admin API (supabase.auth.admin.deleteUser()), which
// only works with the service_role key — never exposable to the browser.
//
// WHY THIS CHECKS FOR LIVE APPS FIRST: every table in this schema that
// references a user (reviews, favorites, fcm_tokens, notifications,
// profiles) is `on delete cascade` — deleting the auth user cleans all of
// it up automatically, which is exactly what #82 (the right to be
// forgotten) needs. But `apps` cascades from `developers`, which cascades
// from `auth.users` too (0001_init.sql) — meaning an unrestricted delete
// here would silently take down every app that developer has published,
// including ones real users have already downloaded, are reviewing, and
// expect to keep working. That's not a privacy feature, that's an outage.
// So: block self-deletion for any account with a developer profile that
// has at least one non-rejected app, and point them at Contact instead —
// removing/transferring a live app needs a careful conversation, not a
// button.

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'POST only' })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ ok: false, error: 'লগইন করা নেই।' })

    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const {
      data: { user },
    } = await caller.auth.getUser()
    if (!user) return jsonResponse({ ok: false, error: 'লগইন করা নেই।' })

    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: developer } = await service.from('developers').select('id').eq('user_id', user.id).maybeSingle()
    if (developer) {
      const { count } = await service
        .from('apps')
        .select('id', { count: 'exact', head: true })
        .eq('developer_id', developer.id)
        .neq('status', 'rejected')

      if (count && count > 0) {
        return jsonResponse({
          ok: false,
          error:
            'তোমার account-এ প্রকাশিত বা পর্যালোচনাধীন app আছে — account নিজে থেকে ডিলিট করা যাবে না, কারণ এতে অন্য ব্যবহারকারীদের জন্য app বন্ধ হয়ে যাবে। Contact পাতা থেকে যোগাযোগ করো, app-গুলো সরিয়ে/transfer করে তারপর account ডিলিট করা হবে।',
        })
      }
    }

    const { error: deleteError } = await service.auth.admin.deleteUser(user.id)
    if (deleteError) {
      console.error('delete-account failed:', deleteError)
      return jsonResponse({ ok: false, error: 'Account ডিলিট করা যায়নি — একটু পরে আবার চেষ্টা করো।' })
    }

    return jsonResponse({ ok: true })
  } catch (err) {
    console.error('delete-account error:', err)
    return jsonResponse({ ok: false, error: 'একটা অপ্রত্যাশিত সমস্যা হয়েছে।' })
  }
})
