import { supabase } from '@/lib/supabaseClient'

/**
 * Phase 6, step 50: captchaToken (from the Turnstile widget in
 * Signup.tsx) is passed straight through to Supabase Auth's own signUp
 * call. Supabase verifies it server-side against Cloudflare before
 * creating the account — as long as Turnstile is turned on as the CAPTCHA
 * provider in the project's Auth settings (see SECURITY_SETUP.md). If it's
 * not turned on there, Supabase just ignores the token and signup works
 * as before — so this is safe to ship even before that's configured.
 */
export async function signUp(email: string, password: string, captchaToken?: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: captchaToken ? { captchaToken } : undefined,
  })
  if (error) throw error
  return data
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  if (error) throw error
}
