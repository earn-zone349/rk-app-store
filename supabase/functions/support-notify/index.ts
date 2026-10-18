// Supabase Edge Function (Deno). Deploy with:
//   supabase functions deploy support-notify
//
// Called client-side right after Support.tsx / AdminSupport.tsx
// successfully inserts a message — fire-and-forget, same pattern as
// AddApp.tsx's runVirusScan() call. The in-app notification (🔔 bell) is
// already guaranteed by the notify_on_support_reply trigger
// (0019_support_notifications.sql) regardless of whether this call
// succeeds — this only adds the OS-level push for someone not currently
// looking at the site. A failure here should never look like the message
// itself failed to send.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendFcmToUser } from '../_shared/fcm.ts'

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
    const { ticketId } = (await req.json()) as { ticketId?: string }
    if (!ticketId) return jsonResponse({ ok: false, error: 'ticketId দরকার।' })

    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: ticket } = await service.from('support_tickets').select('user_id, subject').eq('id', ticketId).single()
    if (!ticket) return jsonResponse({ ok: false, error: 'Ticket পাওয়া যায়নি।' })

    const { data: latestMessage } = await service
      .from('support_ticket_replies')
      .select('sender_type, message')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!latestMessage) return jsonResponse({ ok: true }) // nothing to notify about yet

    const preview = latestMessage.message.slice(0, 100)

    if (latestMessage.sender_type === 'admin') {
      await sendFcmToUser(service, ticket.user_id, 'Support ticket-এ উত্তর এসেছে', preview)
    } else {
      const { data: admins } = await service.from('admins').select('user_id')
      await Promise.all((admins ?? []).map((a) => sendFcmToUser(service, a.user_id, `নতুন Support Message: ${ticket.subject}`, preview)))
    }

    return jsonResponse({ ok: true })
  } catch (err) {
    console.error('support-notify error:', err)
    // Never surfaces as a user-facing error — see the comment at top.
    return jsonResponse({ ok: true })
  }
})
