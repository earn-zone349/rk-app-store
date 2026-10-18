// Supabase Edge Function (Deno). Deploy with:
//   supabase functions deploy admin-action
//
// The only place in the whole app that can change apps.status or
// apps.featured — protect_apps_admin_columns() (0005/0009/0010) locks
// those columns to service_role only, and this function is the one thing
// that uses service_role for that purpose. Every call is checked against
// the admins table first and written to audit_log after, success or
// failure.
//
// Handles four target types as of Phase 4/8/9/10 gap-fixing:
//   targetType: 'app'       — approve/reject/suspend/feature/unfeature
//   targetType: 'report'    — resolve/dismiss a user-submitted report
//     (reports table, 0010_community.sql)
//   targetType: 'developer' — verify/unverify (step 28)
//   targetType: 'dmca'      — resolve/dismiss a copyright takedown claim
//     (dmca_reports table, 0015_dmca.sql, step 80)

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

type AppAction = 'approve' | 'reject' | 'suspend' | 'feature' | 'unfeature'
type ReportAction = 'resolve' | 'dismiss'
type DeveloperAction = 'verify' | 'unverify'
type DmcaAction = 'resolve' | 'dismiss'
type Action = AppAction | ReportAction | DeveloperAction | DmcaAction

const APP_ACTIONS: AppAction[] = ['approve', 'reject', 'suspend', 'feature', 'unfeature']
const REPORT_ACTIONS: ReportAction[] = ['resolve', 'dismiss']
const DEVELOPER_ACTIONS: DeveloperAction[] = ['verify', 'unverify']
const DMCA_ACTIONS: DmcaAction[] = ['resolve', 'dismiss']

const ACTION_TO_STATUS: Partial<Record<AppAction, string>> = {
  approve: 'approved',
  reject: 'rejected',
  suspend: 'suspended',
}

const REASON_REQUIRED: Action[] = ['reject', 'suspend']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'POST only' })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ ok: false, error: 'লগইন করা নেই।' })

    const { targetId, targetType, action, reason } = (await req.json()) as {
      targetId?: string
      targetType?: 'app' | 'report' | 'developer' | 'dmca'
      action?: Action
      reason?: string
    }

    if (!targetId || !targetType || !action) {
      return jsonResponse({ ok: false, error: 'targetId, targetType, ও action — তিনটাই দরকার।' })
    }
    if (targetType === 'app' && !APP_ACTIONS.includes(action as AppAction)) {
      return jsonResponse({ ok: false, error: `অজানা app action: ${action}` })
    }
    if (targetType === 'report' && !REPORT_ACTIONS.includes(action as ReportAction)) {
      return jsonResponse({ ok: false, error: `অজানা report action: ${action}` })
    }
    if (targetType === 'developer' && !DEVELOPER_ACTIONS.includes(action as DeveloperAction)) {
      return jsonResponse({ ok: false, error: `অজানা developer action: ${action}` })
    }
    if (targetType === 'dmca' && !DMCA_ACTIONS.includes(action as DmcaAction)) {
      return jsonResponse({ ok: false, error: `অজানা dmca action: ${action}` })
    }
    if (REASON_REQUIRED.includes(action) && !reason?.trim()) {
      return jsonResponse({ ok: false, error: `"${action}" করতে হলে একটা কারণ লিখতে হবে — developer সেটা দেখতে পাবে।` })
    }

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

    const { data: isAdmin } = await service.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
    if (!isAdmin) {
      // Logged even on a denied attempt — a non-admin (or an admin whose
      // session leaked but who never got past TOTP) hitting this endpoint
      // at all is worth having a record of.
      await service.from('audit_log').insert({
        admin_id: null,
        action: `denied_${action}`,
        target_type: targetType,
        target_id: targetId,
        reason: `admin না এমন user_id দিয়ে চেষ্টা: ${user.id}`,
      })
      return jsonResponse({ ok: false, error: 'তুমি admin না — এই কাজটা করতে পারবে না।' })
    }

    if (targetType === 'app') {
      const appAction = action as AppAction
      const update: Record<string, unknown> = {}
      if (appAction === 'feature') update.featured = true
      else if (appAction === 'unfeature') update.featured = false
      else {
        update.status = ACTION_TO_STATUS[appAction]
        // approve clears any earlier rejection/suspension note; reject/suspend
        // set the note the developer will see on their dashboard.
        update.status_reason = appAction === 'approve' ? null : reason!.trim()
      }

      const { data: updatedRows, error: updateError } = await service
        .from('apps')
        .update(update)
        .eq('id', targetId)
        .select('id')

      if (updateError) {
        console.error('admin-action app update failed:', updateError)
        return jsonResponse({ ok: false, error: 'App আপডেট করা যায়নি।' })
      }
      if (!updatedRows || updatedRows.length === 0) {
        // Update ran without error but matched zero rows — a bad/deleted
        // id would otherwise silently "succeed" and write a misleading
        // audit_log entry for a change that never actually happened.
        return jsonResponse({ ok: false, error: 'এই app আর পাওয়া যাচ্ছে না — অন্য কেউ হয়তো ইতিমধ্যে এটা ডিলিট করেছে।' })
      }

      // #69 — notify the app's developer about the decision. Best-effort:
      // a push-notification failure should never make an otherwise
      // successful approve/reject/suspend look like it failed.
      if (appAction === 'approve' || appAction === 'reject' || appAction === 'suspend') {
        try {
          const { data: appRow } = await service
            .from('apps')
            .select('name, developers(user_id)')
            .eq('id', targetId)
            .single()
          const developerUserId = (appRow?.developers as { user_id?: string } | { user_id?: string }[] | null | undefined)
          const recipientId = Array.isArray(developerUserId) ? developerUserId[0]?.user_id : developerUserId?.user_id
          if (recipientId) {
            const titleByAction: Record<string, string> = {
              approve: 'App অনুমোদন হয়েছে ✓',
              reject: 'App প্রত্যাখ্যান হয়েছে',
              suspend: 'App স্থগিত হয়েছে',
            }
            const title = titleByAction[appAction]
            const body = `"${appRow?.name}"${reason ? ` — ${reason.trim()}` : ''}`

            // #74 — persistent in-app record, alongside the ephemeral FCM
            // push below. Both come from this one event; a failure in
            // either must never affect the other or the app-status change
            // itself (all three are independent best-effort side effects).
            await service.from('notifications').insert({ user_id: recipientId, title, body })
            await sendFcmToUser(service, recipientId, title, body)
          }
        } catch (notifyErr) {
          console.error('FCM notify failed (non-fatal):', notifyErr)
        }
      }
    } else if (targetType === 'developer') {
      const { data: updatedRows, error: updateError } = await service
        .from('developers')
        .update({ verified: action === 'verify' })
        .eq('id', targetId)
        .select('id')

      if (updateError) {
        console.error('admin-action developer update failed:', updateError)
        return jsonResponse({ ok: false, error: 'Developer আপডেট করা যায়নি।' })
      }
      if (!updatedRows || updatedRows.length === 0) {
        return jsonResponse({ ok: false, error: 'এই developer আর পাওয়া যাচ্ছে না।' })
      }
    } else if (targetType === 'dmca') {
      const dmcaStatus = action === 'resolve' ? 'resolved' : 'dismissed'
      const { data: updatedRows, error: updateError } = await service
        .from('dmca_reports')
        .update({ status: dmcaStatus })
        .eq('id', targetId)
        .select('id')

      if (updateError) {
        console.error('admin-action dmca update failed:', updateError)
        return jsonResponse({ ok: false, error: 'DMCA report আপডেট করা যায়নি।' })
      }
      if (!updatedRows || updatedRows.length === 0) {
        return jsonResponse({ ok: false, error: 'এই DMCA report আর পাওয়া যাচ্ছে না।' })
      }
    } else {
      const reportStatus = action === 'resolve' ? 'reviewed' : 'dismissed'
      const { data: updatedRows, error: updateError } = await service
        .from('reports')
        .update({ status: reportStatus })
        .eq('id', targetId)
        .select('id')

      if (updateError) {
        console.error('admin-action report update failed:', updateError)
        return jsonResponse({ ok: false, error: 'Report আপডেট করা যায়নি।' })
      }
      if (!updatedRows || updatedRows.length === 0) {
        return jsonResponse({ ok: false, error: 'এই report আর পাওয়া যাচ্ছে না।' })
      }
    }

    await service.from('audit_log').insert({
      admin_id: user.id,
      action,
      target_type: targetType,
      target_id: targetId,
      reason: reason?.trim() || null,
    })

    return jsonResponse({ ok: true })
  } catch (err) {
    console.error('admin-action error:', err)
    return jsonResponse({ ok: false, error: 'একটা অপ্রত্যাশিত সমস্যা হয়েছে।' })
  }
})
