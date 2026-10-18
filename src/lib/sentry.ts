import * as Sentry from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined

/**
 * #85 — call once at app startup (main.tsx). If VITE_SENTRY_DSN isn't set
 * (the default until MONITORING_SETUP.md is followed), this does nothing —
 * errors still go to the browser console via ErrorBoundary as before, they
 * just aren't shipped anywhere external. That's a deliberate default, not
 * a missing feature: sending error details to a third party is worth
 * doing consciously, not silently on by default.
 */
export function initSentry() {
  if (!dsn) return

  Sentry.init({
    dsn,
    integrations: [Sentry.browserTracingIntegration()],
    // 10% of normal page loads get full performance tracing — enough to
    // spot real slowdowns without paying (Sentry's free tier has a
    // monthly event cap) to trace every single visit.
    tracesSampleRate: 0.1,
    environment: import.meta.env.MODE,
  })
}

/** Used by ErrorBoundary — a no-op when Sentry isn't configured. */
export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (!dsn) return
  Sentry.captureException(error, { extra: context })
}
