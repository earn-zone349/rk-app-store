import { useEffect, useId, useRef } from 'react'

/**
 * Phase 6, step 50: CAPTCHA on registration/report forms.
 *
 * Uses Cloudflare Turnstile rather than reCAPTCHA — no Google account
 * needed to get a site key, it's free with generous limits for a store
 * this size, and it doesn't track/profile visitors the way reCAPTCHA does.
 * The widget script tag lives in index.html (loaded once, globally).
 *
 * IMPORTANT: rendering this widget is only half of CAPTCHA protection. The
 * token it produces must also be verified server-side — a token nobody
 * checks is just decoration. For signup, that verification happens inside
 * Supabase Auth itself (pass captchaToken to supabase.auth.signUp(), with
 * Turnstile enabled as the provider in your Supabase project's Auth
 * settings — see SECURITY_SETUP.md). Other forms that use this widget
 * (e.g. a future "report this app" form) need their own server-side check
 * via Cloudflare's siteverify API before accepting the submission.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: { sitekey: string; callback: (token: string) => void; 'error-callback'?: () => void },
      ) => string
      reset: (widgetId: string) => void
    }
  }
}

interface CaptchaProps {
  onVerify: (token: string | null) => void
}

export default function Captcha({ onVerify }: CaptchaProps) {
  const containerId = useId()
  const widgetIdRef = useRef<string | null>(null)
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

  useEffect(() => {
    if (!siteKey) return

    // The Turnstile script loads asynchronously and may not be ready the
    // instant this component mounts — poll briefly rather than assuming
    // it's already on window.
    let cancelled = false
    const tryRender = () => {
      if (cancelled) return
      const container = document.getElementById(containerId)
      if (window.turnstile && container && !widgetIdRef.current) {
        widgetIdRef.current = window.turnstile.render(container, {
          sitekey: siteKey,
          callback: (token) => onVerify(token),
          'error-callback': () => onVerify(null),
        })
      } else if (!window.turnstile) {
        setTimeout(tryRender, 200)
      }
    }
    tryRender()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onVerify identity churn shouldn't re-mount the widget
  }, [containerId, siteKey])

  if (!siteKey) {
    // Same pattern as supabaseClient.ts's missing-env warning — loud in
    // dev, never silently skips CAPTCHA in a way that's easy to miss.
    return (
      <p className="text-xs text-signal-amber">
        CAPTCHA configure করা হয়নি (VITE_TURNSTILE_SITE_KEY সেট নেই) — SECURITY_SETUP.md দ্রষ্টব্য।
      </p>
    )
  }

  return <div id={containerId} />
}
