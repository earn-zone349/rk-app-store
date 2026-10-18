import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'

/** Mounted once in MainLayout — fires on every route change (client-side navigation included, since a SPA doesn't reload the page for that). */
export function usePageViewTracking() {
  const location = useLocation()

  useEffect(() => {
    // Fire-and-forget, deliberately not awaited — a dropped analytics
    // write should never delay or visibly affect page rendering.
    supabase.from('page_views').insert({ path: location.pathname }).then(({ error }) => {
      if (error) console.warn('page view tracking failed (non-fatal):', error.message)
    })
  }, [location.pathname])
}
