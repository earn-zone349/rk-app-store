// #87 — load test. Requires k6 (https://k6.io — free, open source):
//   macOS:  brew install k6
//   others: https://grafana.com/docs/k6/latest/set-up/install-k6/
//
// Run:
//   SUPABASE_URL=https://yourproject.supabase.co \
//   SUPABASE_ANON_KEY=your-anon-key \
//   k6 run loadtest/browse-and-search.js
//
// ⚠️ READ BEFORE RUNNING AGAINST PRODUCTION:
//   - This hits your real Supabase project's REST API — Supabase's free
//     tier has real request-volume limits, and this script can burn
//     through a meaningful chunk of them in minutes at the default VU
//     count. Start with the small numbers below; raise them deliberately.
//   - Rate-limited endpoints (rate-limit-check, admin-verify-totp) are
//     NOT exercised here on purpose — hammering those in a load test
//     would just test the rate limiter, not the store.
//   - Better to run this against a STAGING Supabase project
//     (PHASE9_SETUP.md, #78) than production, for exactly this reason.

import http from 'k6/http'
import { check, sleep } from 'k6'

const SUPABASE_URL = __ENV.SUPABASE_URL
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY env vars before running (see comment at top of this file).')
}

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
}

// Deliberately modest defaults — a small Bangladeshi app store's real
// concurrent traffic is nowhere near a large consumer app's; this is
// sized to answer "does the app hold up under more than normal load,"
// not to prove it can handle millions of users.
export const options = {
  stages: [
    { duration: '30s', target: 10 }, // ramp up to 10 virtual users
    { duration: '1m', target: 10 }, // hold at 10 for a minute
    { duration: '30s', target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'], // 95% of requests should finish under 1s
    http_req_failed: ['rate<0.01'], // fewer than 1% of requests should fail
  },
}

export default function () {
  // 1. Browse the home page's app list (what Home.tsx's fetchApps() does)
  const homeRes = http.get(
    `${SUPABASE_URL}/rest/v1/apps?status=eq.approved&select=*&order=created_at.desc&limit=12`,
    { headers },
  )
  check(homeRes, { 'home: status 200': (r) => r.status === 200 })
  sleep(1)

  // 2. Browse categories (what Categories.tsx does)
  const categoriesRes = http.get(`${SUPABASE_URL}/rest/v1/categories?select=*`, { headers })
  check(categoriesRes, { 'categories: status 200': (r) => r.status === 200 })
  sleep(1)

  // 3. Search (what Search.tsx does) — a few representative queries
  const queries = ['game', 'photo', 'chat', 'tool']
  const q = queries[Math.floor(Math.random() * queries.length)]
  const searchRes = http.get(
    `${SUPABASE_URL}/rest/v1/apps?status=eq.approved&select=*&name=ilike.*${q}*&limit=20`,
    { headers },
  )
  check(searchRes, { 'search: status 200': (r) => r.status === 200 })
  sleep(2)
}
