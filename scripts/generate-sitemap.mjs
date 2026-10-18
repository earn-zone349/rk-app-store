// Runs BEFORE `vite build` (wired as the "prebuild" script in
// package.json) — a plain Node script, not part of the React app, since
// a client-only SPA can't generate this at request time the way a server
// could. Queries the same public "approved apps" data any anonymous
// visitor can already see (uses the anon key, RLS-scoped exactly like the
// browser) and writes a static sitemap.xml that ends up in dist/.
//
// Needs two env vars at build time (already present in build.yml/
// deploy.yml as GitHub Actions secrets — see SEO_SETUP.md):
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY  (reused, not duplicated)
//   SITE_URL — the actual public URL this deploys to (a GitHub Pages URL
//     or your custom domain — see #76 in SEO_SETUP.md). Falls back to a
//     clearly-fake placeholder so a forgotten env var is obvious in the
//     generated file rather than silently producing broken URLs.

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SITE_URL = process.env.SITE_URL ?? 'https://REPLACE-ME-SITE-URL-NOT-SET.example'

async function main() {
  const staticRoutes = ['', '/search', '/categories', '/login', '/signup']
  const urls = staticRoutes.map((path) => ({ loc: `${SITE_URL}${path}`, priority: path === '' ? '1.0' : '0.6' }))

  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const { data, error } = await supabase.from('apps').select('slug, updated_at').eq('status', 'approved')
    if (error) {
      console.warn('sitemap: could not fetch apps (writing static routes only):', error.message)
    } else {
      for (const app of data ?? []) {
        urls.push({ loc: `${SITE_URL}/app/${app.slug}`, lastmod: app.updated_at, priority: '0.8' })
      }
    }
  } else {
    console.warn('sitemap: VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY not set — writing static routes only.')
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${new Date(u.lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}
    <priority>${u.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>
`

  writeFileSync('public/sitemap.xml', xml)
  console.log(`sitemap: wrote ${urls.length} URLs to public/sitemap.xml`)
}

main()
