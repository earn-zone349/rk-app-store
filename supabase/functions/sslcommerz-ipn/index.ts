// Supabase Edge Function (Deno). Deploy with:
//   supabase functions deploy sslcommerz-ipn --no-verify-jwt
//
// IMPORTANT: --no-verify-jwt is required here — SSLCommerz calls this URL
// directly (server-to-server), with no Supabase auth header at all. This
// function protects itself differently: it re-validates the transaction
// against SSLCommerz's own Validation API before trusting anything the
// incoming request claims, so a forged POST to this URL can't fake a
// payment.
//
// Secrets needed (same ones as sslcommerz-init):
//   supabase secrets set SSLCOMMERZ_STORE_ID=xxxx
//   supabase secrets set SSLCOMMERZ_STORE_PASSWORD=xxxx
//   supabase secrets set SSLCOMMERZ_IS_LIVE=false
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by
// Supabase into every Edge Function — you never set those two yourself.
//
// This function is what actually flips a developer to payment_status='paid'
// — nothing on the frontend can do that (see 0003_payment_gating.sql, which
// gives the anon/public key read-only access to `payments`).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SANDBOX_VALIDATION_URL = 'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php'
const LIVE_VALIDATION_URL = 'https://securepay.sslcommerz.com/validator/api/validationserverAPI.php'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('POST only', { status: 405 })
  }

  try {
    return await handleIpn(req)
  } catch (err) {
    // Log and still acknowledge with 200 — an unhandled exception here
    // (e.g. SSLCommerz's validation endpoint being briefly unreachable)
    // would otherwise make SSLCommerz retry this same webhook repeatedly.
    // Since every write above is idempotent, there's no harm in quietly
    // logging and letting the next retry (or the frontend's own polling)
    // pick it up instead of erroring loudly here.
    console.error('sslcommerz-ipn error:', err)
    return new Response('internal error, logged', { status: 200 })
  }
})

async function handleIpn(req: Request): Promise<Response> {
  // SSLCommerz posts this as application/x-www-form-urlencoded.
  const form = await req.formData()
  const tranId = form.get('tran_id')?.toString()
  const valId = form.get('val_id')?.toString()
  // The `status` field SSLCommerz sends here is never trusted on its own —
  // logged only for debugging; the actual pass/fail decision always comes
  // from the Validation API call below, not from anything the caller claims.
  const claimedStatus = form.get('status')?.toString()
  console.log(`sslcommerz-ipn: tran_id=${tranId} claimed_status=${claimedStatus}`)

  if (!tranId || !valId) {
    return new Response('missing tran_id/val_id', { status: 400 })
  }

  const storeId = Deno.env.get('SSLCOMMERZ_STORE_ID')
  const storePasswd = Deno.env.get('SSLCOMMERZ_STORE_PASSWORD')
  const isLive = Deno.env.get('SSLCOMMERZ_IS_LIVE') === 'true'

  if (!storeId || !storePasswd) {
    return new Response('gateway not configured', { status: 503 })
  }

  // This client uses the service_role key — it deliberately bypasses RLS,
  // because this is the one place in the whole app that's allowed to write
  // to `payments` and flip `developers.payment_status`. It must NEVER be
  // used anywhere reachable from the browser.
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Step 1: re-check this transaction directly with SSLCommerz. Never trust
  // the incoming POST body alone — anyone could POST a fake "VALID" status
  // to this public URL. The Validation API call is the actual proof.
  const validationUrl = new URL(isLive ? LIVE_VALIDATION_URL : SANDBOX_VALIDATION_URL)
  validationUrl.searchParams.set('val_id', valId)
  validationUrl.searchParams.set('store_id', storeId)
  validationUrl.searchParams.set('store_passwd', storePasswd)
  validationUrl.searchParams.set('format', 'json')

  const validationRes = await fetch(validationUrl.toString())
  const validation = await validationRes.json()

  const isGenuine =
    (validation.status === 'VALID' || validation.status === 'VALIDATED') &&
    validation.tran_id === tranId

  // Step 2: find our own payment record for this transaction (created by
  // sslcommerz-init before the developer was redirected to pay).
  const { data: payment } = await supabaseAdmin
    .from('payments')
    .select('id, developer_id, amount')
    .eq('gateway_reference', tranId)
    .maybeSingle()

  if (!payment) {
    // Nothing we recognize — acknowledge with 200 anyway so SSLCommerz
    // doesn't retry forever, but don't touch any data.
    return new Response('unknown transaction, ignored', { status: 200 })
  }

  if (!isGenuine) {
    const reason = `SSLCommerz validation status: ${validation.status ?? 'unknown'}`
    await supabaseAdmin.from('payments').update({ status: 'failed', failure_reason: reason }).eq('id', payment.id)
    return new Response('validation failed', { status: 200 })
  }

  // Extra safety: the amount SSLCommerz confirms must match what we asked
  // for, so a tampered client-side amount can never slip through.
  const confirmedAmount = Number(validation.amount ?? validation.currency_amount ?? 0)
  if (Math.abs(confirmedAmount - Number(payment.amount)) > 0.5) {
    const reason = `Amount mismatch: expected ${payment.amount}, gateway confirmed ${confirmedAmount}`
    await supabaseAdmin.from('payments').update({ status: 'failed', failure_reason: reason }).eq('id', payment.id)
    return new Response('amount mismatch', { status: 200 })
  }

  // Step 3: mark the payment successful and the developer as paid. Two
  // writes, but both idempotent — SSLCommerz may call this URL more than
  // once for the same transaction, and re-running this is harmless.
  await supabaseAdmin.from('payments').update({ status: 'success' }).eq('id', payment.id)
  await supabaseAdmin
    .from('developers')
    .update({ payment_status: 'paid' })
    .eq('id', payment.developer_id)

  return new Response('ok', { status: 200 })
}
