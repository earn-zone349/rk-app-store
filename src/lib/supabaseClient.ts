import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  // Loud in dev, so a missing .env file is caught immediately instead of
  // failing silently deep inside a data call.
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set. ' +
      'Copy .env.example to .env and fill in your project values.',
  )
}

// Only the anon (public) key ever belongs in frontend code.
// The service-role key must stay server-side (Supabase Edge Functions / GitHub
// Actions secrets) and must never be imported here.
export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '')
