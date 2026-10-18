import { supabase } from '@/lib/supabaseClient'
import type { AppSettings } from '@/types'

/**
 * Reads the single app_settings row. This is the "is payment turned on yet"
 * switch described in PAYMENT_SETUP.md — while payment_enabled is false,
 * only the store owner can publish apps (enforced by RLS, not just here).
 */
export async function fetchAppSettings(): Promise<AppSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('payment_enabled, developer_fee_amount, developer_fee_currency')
    .eq('id', true)
    .single()

  if (error) throw error

  return {
    paymentEnabled: data.payment_enabled,
    developerFeeAmount: Number(data.developer_fee_amount),
    developerFeeCurrency: data.developer_fee_currency,
  }
}
