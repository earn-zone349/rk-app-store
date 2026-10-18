# PHASE9_SETUP.md — Polish

Phase 9-এর যে অংশগুলো pure code (#70 SEO, #71 performance, #72 error handling, #73 analytics, #74 notifications, #75 legal pages) সেগুলো কোনো setup ছাড়াই কাজ করবে migration চালানোর পর। বাকিগুলোর জন্য এই guide।

## #70 — SEO: SITE_URL সেট করা

`sitemap.xml` সঠিক absolute URL বানাতে GitHub repo-তে একটা **variable** (secret না, এটা sensitive কিছু না) সেট করতে হবে:

Repo → **Settings** → **Secrets and variables** → **Actions** → **Variables** ট্যাব → **New repository variable**:
```
Name: SITE_URL
Value: https://username.github.io/rk-app-store   (অথবা custom domain থাকলে সেটা)
```

## #76 — Custom Domain

GitHub Pages custom domain সাপোর্ট করে, কোনো নতুন hosting লাগবে না:

1. একটা domain কেনো (Namecheap, GoDaddy, বা বাংলাদেশি কোনো registrar থেকে)
2. Domain-এর DNS-এ একটা **CNAME record** যোগ করো: `www` → `username.github.io`
   (root domain-এর জন্য A record লাগবে GitHub-এর IP-গুলোতে — GitHub-এর নিজের docs-এ ঠিক IP list পাওয়া যাবে: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)
3. Repo → Settings → Pages → "Custom domain"-এ domain-টা লিখে Save করো
4. `vite.config.ts`-এ `BASE_PATH` env var আর দরকার নেই (root domain-এ deploy হচ্ছে, subpath-এ না) — `deploy.yml`-এ `BASE_PATH: /${{ github.event.repository.name }}/` লাইনটা মুছে দাও
5. উপরের #70-এর `SITE_URL` variable-টা নতুন domain দিয়ে আপডেট করো

## #77 — Security Headers

`public/_headers` ফাইলে হেডারগুলো লেখা আছে, কিন্তু **GitHub Pages এই ফাইল পড়ে না** — এটা শুধু Netlify/Cloudflare Pages পড়ে (deploy-staging.yml-এর Netlify deploy-এ এটা কাজ করবে)। Production-ও যদি এই headers চাও, GitHub Pages থেকে Cloudflare Pages/Netlify-এ migrate করা লাগবে (দুটোই ফ্রি, deploy.yml-এর মতোই একটা GitHub Action দিয়ে করা যায়)। আপাতত `index.html`-এর ভেতরের `<meta http-equiv="Content-Security-Policy">` ট্যাগটাই যা পাওয়া যাচ্ছে তার মধ্যে সবচেয়ে কাছাকাছি — এটা ইতিমধ্যে আছে, কিছু করা লাগবে না।

## #78 — Staging Environment

1. **দ্বিতীয় একটা Supabase project** বানাও (staging-এর জন্য, production data থেকে আলাদা রাখতে) — SETUP.md-এর ধাপগুলো আবার অনুসরণ করো, সব migration ওখানেও চালাও
2. **Netlify-তে ফ্রি account** খোলো (https://netlify.com), একটা নতুন site বানাও (কোনো GitHub সংযোগ ছাড়াই — "Deploy manually" বেছে নাও)
3. Netlify site-এর **Site ID** কপি করো (Site settings → General → Site details)
4. Netlify-তে একটা **Personal Access Token** বানাও (User settings → Applications → New access token)
5. GitHub repo secrets-এ যোগ করো:
   ```
   NETLIFY_AUTH_TOKEN=...
   NETLIFY_SITE_ID=...
   VITE_SUPABASE_URL_STAGING=...
   VITE_SUPABASE_ANON_KEY_STAGING=...
   ```
6. `git checkout -b develop` করে push করলেই `deploy-staging.yml` চলবে, staging Supabase project দিয়ে build হয়ে Netlify-তে deploy হবে

এরপর থেকে workflow: নতুন কাজ `develop` ব্রাঞ্চে করো → staging-এ test করো → ঠিক থাকলে `main`-এ merge করো → production (GitHub Pages) deploy হবে।

## #79 — Database Backup

1. Supabase Dashboard → Project Settings → Database → **Connection string** (URI format) কপি করো
2. GitHub repo secret হিসেবে যোগ করো: `DATABASE_URL=postgresql://...`
3. এখন থেকে প্রতিদিন রাত ২টায় (বাংলাদেশ সময়) স্বয়ংক্রিয়ভাবে backup হবে, ৯০ দিন পর্যন্ত রাখা থাকবে

**Restore করতে হলে** (কখনো দরকার হলে):
```bash
# GitHub Actions-এর run history থেকে backup-*.dump ফাইলটা ডাউনলোড করো, তারপর:
pg_restore --no-owner --no-privileges -d "তোমার-DATABASE_URL" backup-YYYY-MM-DD.dump
```

⚠️ **এখনই backup workflow-টা একবার manually চালিয়ে (Actions ট্যাব → Database Backup → Run workflow) test করে দেখে নাও যে সত্যিই কাজ করছে** — একটা backup system যেটা কখনো test করা হয়নি, সেটা backup-ই না, আশা।
