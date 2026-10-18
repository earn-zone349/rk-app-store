import { supabase } from '@/lib/supabaseClient'

export interface Payment {
  id: string
  amount: number
  currency: string
  gateway: string
  gatewayReference: string | null
  status: 'pending' | 'success' | 'failed'
  createdAt: string
}

/** #36 — the developer's own payment history, for the in-app receipt page. RLS ("developers can view their own payments", 0003) already scopes this to just their rows. */
export async function fetchMyPayments(developerId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('id, amount, currency, gateway, gateway_reference, status, created_at')
    .eq('developer_id', developerId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    amount: Number(row.amount),
    currency: row.currency,
    gateway: row.gateway,
    gatewayReference: row.gateway_reference,
    status: row.status,
    createdAt: row.created_at,
  }))
}

/** #40 — the reason behind the developer's most recent failed payment attempt, shown on the fail banner instead of just "try again." */
export async function fetchLatestFailureReason(
  developerId: string,
): Promise<{ reason: string | null; attemptNumber: number } | null> {
  const { data, error } = await supabase
    .from('payments')
    .select('failure_reason, attempt_number')
    .eq('developer_id', developerId)
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return { reason: data.failure_reason, attemptNumber: data.attempt_number }
}

/**
 * Asks the sslcommerz-init Edge Function for a checkout session, then
 * redirects the browser straight to SSLCommerz's hosted payment page.
 * Throws with a Bangla message on failure so the caller can show it as-is.
 */
export async function startDeveloperPayment(): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ gatewayUrl?: string; error?: string }>(
    'sslcommerz-init',
    { method: 'POST' },
  )

  if (error) {
    throw new Error('Payment শুরু করা যায়নি — একটু পরে আবার চেষ্টা করো।')
  }
  if (!data?.gatewayUrl) {
    throw new Error(data?.error ?? 'Payment session তৈরি করা যায়নি।')
  }

  // Full-page redirect to SSLCommerz's own hosted checkout — the app never
  // sees card numbers or bKash PINs directly.
  window.location.href = data.gatewayUrl
}
