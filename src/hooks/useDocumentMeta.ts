import { useEffect } from 'react'

/**
 * #70 — a client-rendered SPA can't do full SEO the way a server-rendered
 * site can (a crawler that doesn't execute JS sees an empty shell) —
 * that's an inherent limitation of this architecture, not something this
 * hook fixes. What it DOES fix: Google's crawler and every major social
 * platform's link-preview bot (Facebook, WhatsApp, Twitter/X) all execute
 * JavaScript before reading <title>/<meta>, so a distinct, accurate title
 * and description per page still meaningfully helps both search ranking
 * and how a shared link looks. If SEO becomes business-critical later,
 * the real next step is server-side rendering or prerendering
 * (e.g. vite-plugin-ssr, or a prerender service) — worth knowing that
 * ceiling exists rather than assuming this hook is the complete answer.
 */
export function useDocumentMeta(title: string, description?: string) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = `${title} · RK App Store`

    let descriptionTag: HTMLMetaElement | null = null
    let previousDescription: string | null = null
    if (description) {
      descriptionTag = document.querySelector('meta[name="description"]')
      if (descriptionTag) {
        previousDescription = descriptionTag.getAttribute('content')
        descriptionTag.setAttribute('content', description)
      }
    }

    return () => {
      document.title = previousTitle
      if (descriptionTag && previousDescription !== null) {
        descriptionTag.setAttribute('content', previousDescription)
      }
    }
  }, [title, description])
}
