import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '@/lib/sentry'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * #72 — without this, any uncaught render error (a bad API response
 * shaped differently than expected, a null reference, etc.) crashes the
 * entire React tree and the visitor sees a blank white page with no way
 * forward except guessing to hit reload. This catches that at the root
 * and shows something a non-technical visitor can actually act on.
 *
 * Deliberately a class component — catching render errors (componentDid
 * CatchError / getDerivedStateFromError) is one of the few things React
 * still requires a class for; there's no hook equivalent.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Goes to the browser console always; also to Sentry if configured
    // (reportError is a no-op otherwise — see src/lib/sentry.ts).
    console.error('Unhandled render error:', error, info)
    reportError(error, { componentStack: info.componentStack })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="text-4xl">😕</p>
          <h1 className="text-lg font-semibold">কিছু একটা ভুল হয়েছে</h1>
          <p className="text-sm text-ink/60">
            পাতাটা লোড করতে সমস্যা হয়েছে। রিফ্রেশ করলে সাধারণত ঠিক হয়ে যায়।
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-card bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            পাতা রিফ্রেশ করো
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
