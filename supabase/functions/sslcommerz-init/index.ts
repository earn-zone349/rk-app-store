// Supabase Edge Function (Deno). Deploy with:
//   supabase functions deploy sslcommerz-init
// Secrets needed (set once you have real SSLCommerz credentials):
//   supabase secrets set SSLCOMMERZ_STORE_ID=xxxx
//   supabase secrets set SSLCOMMERZ_STORE_PASSWORD=xxxx
//   supabase secrets set SSLCOMMERZ_IS_LIVE=false   # "true" once you go live
//   supabase secrets set PUBLIC_SITE_URL=https://your-site-url
//
// This function is called from the frontend (via supabase.functions.invoke)
// once the developer clicks "Pay Now". It:
//   1. Verifies the caller is logged in and has a developer profile
//   2. Records a 'pending' row in `payments`
//   3. Asks SSLCommerz for a checkout session (Gateway Page URL)
//   4. Returns that URL so the frontend can redirect the developer to it
//
// See PAYMENT_SETUP.md for exactly how to wire this up once you have your
// SSLCommerz store credentials.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SANDBOX_API_URL = 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php'
const LIVE_API_URL = 'https://securepay.sslcommerz.com/gwprocess/v4/api.php'

// Called directly from the browser (supabase.functions.invoke), which means
// the browser first sends a CORS preflight (OPTIONS) because the request
// carries an Authorization header. Without these headers on every response
// — including the preflight — the browser blocks the call entirely before
// it even reaches the JSON body, and the "পে করুন" button would silently
// fail with a CORS error in the console.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown) {
  // Always 200: supabase-js's functions.invoke() can't reliably surface a
  // response body back to the caller when the HTTP status isn't 2xx (it
  // sets `error` and leaves `data` null instead) — so every expected
  // outcome, success or handled failure, comes back as 200 with either
  // `gatewayUrl` or `error` in the body. src/services/payments.ts checks
  // for `data.error` first, which only works if we're consistent about this.
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST only' })
  }

  try {
    return await handlePaymentInit(req)
  } catch (err) {
    // Any unexpected failure (SSLCommerz unreachable, malformed response,
    // etc.) still needs to go through jsonResponse() so the CORS headers
    // are present — otherwise Deno's default error response reaches the
    // browser with no Access-Control-Allow-Origin header, and the actual
    // error gets masked by a confusing generic CORS failure instead.
    console.error('sslcommerz-init error:', err)
    return jsonResponse({ error: 'একটা অপ্রত্যাশিত সমস্যা হয়েছে — একটু পরে আবার চেষ্টা করো।' })
  }
})

async function handlePaymentInit(req: Request): Promise<Response> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'লগইন করা নেই।' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return jsonResponse({ error: 'লগইন করা নেই।' })
  }

  const { data: developer, error: devError } = await supabase
    .from('developers')
    .select('id, developer_name, support_email, phone')
    .eq('user_id', user.id)
    .single()

  if (devError || !developer) {
    return jsonResponse({ error: 'Developer প্রোফাইল পাওয়া যায়নি।' })
  }

  const { data: settings } = await supabase
    .from('app_settings')
    .select('developer_fee_amount, developer_fee_currency')
    .eq('id', true)
    .single()

  const amount = settings?.developer_fee_amount ?? 500
  const currency = settings?.developer_fee_currency ?? 'BDT'

  const storeId = Deno.env.get('SSLCOMMERZ_STORE_ID')
  const storePasswd = Deno.env.get('SSLCOMMERZ_STORE_PASSWORD')
  const isLive = Deno.env.get('SSLCOMMERZ_IS_LIVE') === 'true'
  const siteUrl = Deno.env.get('PUBLIC_SITE_URL') ?? 'http://localhost:5173'

  if (!storeId || !storePasswd) {
    return jsonResponse({
      error: 'Payment gateway এখনো configure করা হয়নি (SSLCOMMERZ_STORE_ID/PASSWORD secret সেট করা নেই)।',
    })
  }

  const tranId = `dev-${developer.id}-${Date.now()}`

  // #40 — which attempt this is for this developer (1st try, 2nd retry
  // after a failure, etc.) — read via an RPC so the counting logic lives
  // in one place (0016_payment_retry_fix.sql) instead of being
  // recalculated here and separately anywhere else that might create a
  // payment row later.
  const { data: attemptNumber } = await supabase.rpc('next_payment_attempt_number', {
    p_developer_id: developer.id,
  })

  // Record the attempt before contacting SSLCommerz, so even a network
  // failure leaves an audit trail.
  await supabase.from('payments').insert({
    developer_id: developer.id,
    amount,
    currency,
    gateway: 'sslcommerz',
    gateway_reference: tranId,
    status: 'pending',
    attempt_number: attemptNumber ?? 1,
  })

  const body = new URLSearchParams({
    store_id: storeId,
    store_passwd: storePasswd,
    total_amount: amount.toFixed(2),
    currency,
    tran_id: tranId,
    success_url: `${siteUrl}/developer?payment=success`,
    fail_url: `${siteUrl}/developer?payment=fail`,
    cancel_url: `${siteUrl}/developer?payment=cancel`,
    ipn_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/sslcommerz-ipn`,
    shipping_method: 'NO',
    product_name: 'RK App Store Developer Publishing Fee',
    product_category: 'Digital Service',
    product_profile: 'general',
    num_of_item: '1',
    cus_name: developer.developer_name,
    cus_email: developer.support_email ?? user.email ?? 'no-reply@example.com',
    cus_phone: developer.phone ?? '01700000000', // fallback only for developers created before the phone field existed
    cus_add1: 'N/A',
    cus_city: 'Dhaka',
    cus_country: 'Bangladesh',
  })

  const sslResponse = await fetch(isLive ? LIVE_API_URL : SANDBOX_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const sslData = await sslResponse.json()

  if (sslData.status !== 'SUCCESS') {
    return jsonResponse({ error: sslData.failedreason ?? 'Payment session তৈরি করা যায়নি।' })
  }

  return jsonResponse({ gatewayUrl: sslData.GatewayPageURL })
}
