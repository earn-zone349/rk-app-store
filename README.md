# RK App Store

নিজস্ব app marketplace — React + TypeScript + Vite + Tailwind CSS, Supabase (Postgres/Auth/Storage), এবং GitHub Actions দিয়ে build/deploy। PWA ছাড়াই, শুধু browser + GitHub দিয়ে কাজ করা যায়।

**👉 Account খোলা ও key বসানোর সম্পূর্ণ ধাপে-ধাপে গাইড: [`SETUP.md`](./SETUP.md)** — এই ফাইলটা আগে পড়ো।

**👉 Developer System + Payment চালু করার গাইড: [`PAYMENT_SETUP.md`](./PAYMENT_SETUP.md)** — Phase 3 শেষ করার পর এটা পড়ো।

## এখন পর্যন্ত যা যা তৈরি (Phase 1–5, master roadmap অনুযায়ী)

**Phase 1 — Foundation**
- Vite + React + TypeScript + Tailwind CSS scaffold
- GitHub Actions: `build.yml` (lint+build প্রতি push/PR-এ), `deploy.yml` (GitHub Pages-এ auto-deploy)

**Phase 2 — Store**
- Home (Trending + Categories), Search (sort সহ), Categories, App Details পাতা
- Pagination / "আরও দেখুন" (load more)
- Bangla/English language toggle

**Phase 3 — Backend**
- Supabase client, Auth (Signup/Login/Forgot/Reset), Database schema + RLS
- Storage: icon/screenshot/APK আপলোড + client-side image compression
- APK hosting strategy: এখন Supabase Storage, স্কেল বাড়লে Cloudflare R2

**Phase 4 — Developer System**
- Developer Registration, Dashboard, Add New App form (icon/screenshot/APK আপলোড সহ), App Update (নতুন version)
- সবকিছু database-level RLS দিয়ে সুরক্ষিত — একজন developer শুধু নিজের app-ই দেখতে/বদলাতে পারবে

**Phase 5 — Payment (SSLCommerz)**
- `app_settings.payment_enabled` — একটা মাত্র সুইচ, যেটা false থাকা অবস্থায় শুধু owner (তুমি) app publish করতে পারবে
- Payment checkout, SSLCommerz IPN webhook (server-side validation সহ), payment history — সব কোড রেডি, শুধু SSLCommerz sandbox/real account লাগবে চালু করতে
- বিস্তারিত: `PAYMENT_SETUP.md`

Store-এর public app list এখনো mock data (`src/services/apps.ts`) থেকে আসছে — Phase 7 (Admin approve)-এর পর real approved app এখানে দেখানো শুরু হবে।

## Codespaces / mobile browser দিয়ে শুরু করা

1. এই repo-টা GitHub-এ push করো।
2. Repo → **Code → Codespaces → Create codespace on main**।
3. Codespace খুললে terminal-এ:
   ```bash
   npm install
   cp .env.example .env   # তারপর SETUP.md অনুযায়ী নিজের Supabase key বসাও
   npm run dev
   ```
4. Preview-এর জন্য Codespaces নিজেই একটা forwarded URL দেবে — সেটাই তোমার phone browser-এ খুলবে।

## GitHub Pages deploy চালু করার জন্য (একবারই লাগবে)

1. Repo → **Settings → Pages** → Source: **GitHub Actions**।
2. Repo → **Settings → Secrets and variables → Actions** এ দুটো secret যোগ করো (মান `SETUP.md`-এ কীভাবে বের করবে তা লেখা আছে):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. `main` branch-এ push করলেই `deploy.yml` build করে site publish করে দেবে।

## পরের ধাপ (Phase 6+)

- Phase 6: APK signature verification, malware scanning (VirusTotal), permission extraction, CAPTCHA, rate limiting
- Phase 7: Admin panel (approve/reject/suspend, revenue dashboard, audit log)
- Phase 8: Rating/Reviews, favorites, email notifications
