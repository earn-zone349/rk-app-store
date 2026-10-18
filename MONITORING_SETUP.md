# MONITORING_SETUP.md — Phase 11 (#85, #87)

## #85 — Sentry (error monitoring)

1. https://sentry.io এ একটা ফ্রি account খোলো (মাসে ৫,০০০ error event পর্যন্ত ফ্রি)
2. **Create Project** → platform হিসেবে **React** বেছে নাও
3. যে **DSN** (একটা URL-এর মতো দেখতে key) দেখাবে সেটা কপি করো
4. GitHub repo secret হিসেবে যোগ করো: `VITE_SENTRY_DSN=তোমার-dsn`
   (Repo → Settings → Secrets and variables → Actions → New repository secret)
5. পরের deploy থেকেই সক্রিয় হয়ে যাবে — কিছু rebuild/redeploy করলেই হবে

**Local dev-এ test করতে চাইলে:** `.env`-এ `VITE_SENTRY_DSN` বসাও, `npm run dev` চালাও, তারপর কোনো একটা পাতায় ইচ্ছাকৃতভাবে error ঘটাও (যেমন browser console-এ `throw new Error('test')`) — Sentry dashboard-এ কয়েক সেকেন্ডে দেখা উচিত।

**উল্লেখযোগ্য:** DSN সেট না করা পর্যন্ত সবকিছু আগের মতোই কাজ করবে (error শুধু browser console-এ যাবে) — এটা ইচ্ছাকৃত, চুপচাপ কারো ব্রাউজিং ডেটা বাইরে পাঠানো শুরু হয়ে যাওয়া উচিত না।

## #87 — Load Testing

`loadtest/browse-and-search.js`-এ পুরো script ও সতর্কতা লেখা আছে। সংক্ষেপে:

```bash
brew install k6   # অথবা https://grafana.com/docs/k6/latest/set-up/install-k6/ থেকে

SUPABASE_URL=https://তোমার-STAGING-project.supabase.co \
SUPABASE_ANON_KEY=staging-anon-key \
k6 run loadtest/browse-and-search.js
```

⚠️ **Production project-এর বদলে staging project (PHASE9_SETUP.md, #78) ব্যবহার করো** — Supabase-এর ফ্রি/lower tier-এ request limit আছে, আর load test দিয়েই সেই limit শেষ করে ফেলা সহজ।

Result-এ `http_req_duration` আর `http_req_failed`-এর দিকে খেয়াল রাখো — script-এর ভেতরেই "৯৫% request ১ সেকেন্ডের মধ্যে শেষ হওয়া উচিত, ১%-এর কম fail হওয়া উচিত" এই threshold সেট করা আছে, না মিললে k6 নিজেই লাল করে দেখাবে।

## #86 — CDN নোট

R2-তে migrate করার ফলে APK ডাউনলোড ইতিমধ্যেই Cloudflare-এর CDN দিয়ে সার্ভ হচ্ছে (R2 নিজেই Cloudflare-এর edge network ব্যবহার করে) — আলাদা কিছু করার দরকার নেই। আরও নিয়ন্ত্রণ চাইলে (cache rules, custom domain) R2_SETUP.md-এর "Custom domain" অংশ দেখো।
