// Supabase Edge Function (Deno). Deploy with:
//   supabase functions deploy admin-lookup-emails
//
// Why this exists: auth.users has no RLS-exposed table a client can query
// at all (by design — Supabase doesn't expose it), so "show the admin
// which email each support ticket belongs to" needs a server-side lookup
// via the Auth Admin API, same as admin-enroll's email->id direction but
// reversed (id->email) here.

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
  if (req.method !== 'POST') return jsonResponse({ emails: {} })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ emails: {} })

    const { userIds } = (await req.json()) as { userIds?: string[] }
    if (!userIds || userIds.length === 0) return jsonResponse({ emails: {} })

    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const {
      data: { user },
    } = await caller.auth.getUser()
    if (!user) return jsonResponse({ emails: {} })

    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: isAdmin } = await service.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
    if (!isAdmin) return jsonResponse({ emails: {} }) // silently empty, not an error — same non-leaking approach as admin-verify-totp

    // listUsers() is paginated (max 1000/page) and doesn't support
    // filtering by a specific id list — fine at this store's scale
    // (a handful of admins looking up a handful of ticket authors), but
    // worth knowing this wouldn't scale to tens of thousands of users
    // without switching to per-id auth.admin.getUserById() calls instead.
    const { data: userList, error } = await service.auth.admin.listUsers({ perPage: 1000 })
    if (error) return jsonResponse({ emails: {} })

    const emails: Record<string, string> = {}
    for (const id of userIds) {
      const match = userList.users.find((u) => u.id === id)
      if (match?.email) emails[id] = match.email
    }

    return jsonResponse({ emails })
  } catch (err) {
    console.error('admin-lookup-emails error:', err)
    return jsonResponse({ emails: {} })
  }
})
