# SETUP GUIDE — Phase 1, 2, 3 (Account তৈরি ও Key বসানো)

এই guide-এ শুধু সেটাই আছে যেটা তোমাকে **নিজে হাতে করতে হবে** — account খোলা, key বের করা, আর সেগুলো সঠিক জায়গায় বসানো। Code-এর অংশ (Auth, Storage, RLS, pagination, language toggle, image compression, APK hosting logic) সব আগেই লেখা হয়ে গেছে — নিচের ধাপগুলো শেষ করলেই সেগুলো live হয়ে যাবে।

ধাপগুলো ঠিক ক্রম অনুযায়ী করবে, কারণ পরের ধাপ আগের ধাপের উপর নির্ভর করে।

---

## ধাপ ১ — GitHub (Phase 1)

তুমি নিশ্চয়ই আগেই GitHub account খুলেছ। যদি না থাকে:

1. https://github.com এ গিয়ে **Sign up**
2. নতুন একটা **repository** বানাও — নাম দাও `rk-app-store`, **Private** রাখতে পারো শুরুতে
3. এই zip-এর ভেতরের সব ফাইল সেই repo-তে push করো (Codespaces থেকেই করা যাবে)

**এখানে কোনো API key লাগবে না।**

---

## ধাপ ২ — Supabase (Phase 3 — এখনই সবচেয়ে জরুরি)

### 2.1 Account ও Project তৈরি

1. https://supabase.com এ যাও → **Start your project** → GitHub দিয়ে sign up করো (সহজ হবে)
2. **New Project** ক্লিক করো
3. Fill up করো:
   - **Name:** `rk-app-store`
   - **Database Password:** একটা শক্ত পাসওয়ার্ড দাও, **আলাদা করে সংরক্ষণ করে রাখো** (কোথাও লিখে রাখো — এটা হারালে DB access-এ সমস্যা হবে)
   - **Region:** যেটা তোমার user-দের সবচেয়ে কাছে (Singapore ভালো হবে বাংলাদেশের জন্য)
4. **Create new project** — তৈরি হতে ১-২ মিনিট লাগবে

### 2.2 Key সংগ্রহ করা

Project তৈরি হওয়ার পর:

1. বাম পাশের মেনু থেকে **Project Settings** (⚙️ icon) → **API**
2. এখানে দুটো জিনিস কপি করে রাখো:
   - **Project URL** — এটাই `VITE_SUPABASE_URL`
   - **anon / public key** — এটাই `VITE_SUPABASE_ANON_KEY`

⚠️ **অত্যন্ত গুরুত্বপূর্ণ:** এই পাতাতেই আরেকটা key দেখবে — **`service_role` key**। এটা **কখনোই** frontend code-এ, `.env` ফাইলে, বা GitHub-এ push করা কোনো ফাইলে ব্যবহার করবে না। এই key দিয়ে RLS bypass করে সব data access করা যায় — leak হলে পুরো database অরক্ষিত হয়ে যাবে। এটা শুধু ভবিষ্যতে admin/server-side ফাংশনে লাগবে (Phase 6-7), আর তখনও শুধু Supabase Edge Function বা GitHub Actions secret হিসেবে থাকবে, কোনো client-side code-এ না।

### 2.3 Database schema বসানো (Step 17)

1. বাম মেনু থেকে **SQL Editor** এ যাও
2. **New query** ক্লিক করো
3. Project-এর `supabase/migrations/0001_init.sql` ফাইলের পুরো content copy করে paste করো
4. **Run** চাপো — এতে সব table (apps, developers, reviews, ইত্যাদি) আর RLS policy তৈরি হয়ে যাবে
5. একই ভাবে `supabase/migrations/0002_storage_policies.sql` ফাইলটাও চালাও — এতে icons/screenshots/apks bucket তৈরি হবে আর সেগুলোর security policy বসবে

### 2.4 Auth চালু করা (Step 16)

1. বাম মেনু থেকে **Authentication → Providers**
2. **Email** provider এমনিতেই enabled থাকে — তাই আলাদা কিছু করার দরকার নেই signup/login কাজ করার জন্য
3. **Authentication → URL Configuration** এ গিয়ে:
   - **Site URL** এ বসাও তোমার site-এর URL (এখন dev করার সময় `http://localhost:5173`, পরে deploy হলে GitHub Pages/custom domain URL দিয়ে বদলে দেবে)
   - **Redirect URLs** এ যোগ করো `http://localhost:5173/reset-password` (আর পরে production URL-ও)
4. চাইলে **Authentication → Email Templates** এ গিয়ে confirmation/reset email-এর ভাষা বাংলায় customize করতে পারো (ঐচ্ছিক)

### 2.5 Local-এ key বসানো

1. Project-এর root-এ `.env.example` ফাইলটা copy করে নাম দাও `.env`
2. `.env` ফাইলে 2.2-এ collect করা মান বসাও:
   ```
   VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
3. `.env` ফাইলটা **কখনো GitHub-এ push হবে না** (`.gitignore`-এ আগে থেকেই বাদ দেওয়া আছে) — তাই নিশ্চিন্তে রাখো

### 2.6 GitHub Actions-এ key বসানো (deploy চালু রাখতে)

Build/deploy workflow-এও এই একই key লাগবে, কারণ GitHub Actions তোমার লোকাল `.env` দেখতে পায় না:

1. GitHub repo-তে যাও → **Settings → Secrets and variables → Actions**
2. **New repository secret** — দুইবার করো:
   - Name: `VITE_SUPABASE_URL`, Value: same as above
   - Name: `VITE_SUPABASE_ANON_KEY`, Value: same as above
3. এরপর `main` branch-এ push করলেই `build.yml` আর `deploy.yml` এই secret দুটো ব্যবহার করে build করবে

---

## ধাপ ৩ — APK Storage bucket সীমা মনে রাখা (Step 20)

এই ধাপে আলাদা কোনো account লাগবে না এখনই — Phase 3-এর জন্য APK, icon, screenshot সব **Supabase Storage**-এই থাকবে (২.৩-এ যে bucket তৈরি হলো)।

শুধু মাথায় রাখো: Supabase free tier-এ storage/bandwidth-এর সীমা আছে। App/user বাড়লে **Cloudflare R2**-এ migrate করা লাগতে পারে (Phase 11-এ)। তখন শুধু `src/services/storage.ts` ফাইলটা বদলালেই হবে — বাকি কোনো কোড ছুঁতে হবে না। এখন এটা নিয়ে ভাবার দরকার নেই।

---

## চেকলিস্ট — Phase 3 শেষ করার আগে নিশ্চিত করো

- [ ] Supabase project তৈরি হয়েছে
- [ ] `Project URL` আর `anon key` কোথাও safe জায়গায় copy করা আছে
- [ ] `0001_init.sql` SQL Editor-এ run করা হয়েছে (error ছাড়া)
- [ ] `0002_storage_policies.sql` SQL Editor-এ run করা হয়েছে (error ছাড়া)
- [ ] `.env` ফাইলে key বসানো হয়েছে (local dev-এর জন্য)
- [ ] GitHub repo secrets-এ একই key বসানো হয়েছে (deploy-এর জন্য)
- [ ] `service_role` key কোথাও frontend code/`.env`-এ বসানো হয়নি

এই checklist শেষ হলে Phase 3 সম্পূর্ণ, আর Phase 4 (Developer System + Payment) শুরু করার জন্য backend পুরোপুরি প্রস্তুত।

---

## এরপর কোন account কখন লাগবে (reminder)

| Account | কখন লাগবে |
|---|---|
| Payment gateway (Stripe/SSLCommerz) | Phase 5 শুরুর আগে — verification-এ সময় লাগে বলে এখনই শুরু করে রাখা ভালো |
| VirusTotal | Phase 6 |
| Email service (Resend/SendGrid) | Phase 8 |
| reCAPTCHA/hCaptcha | Phase 6 |
| Domain registrar | Phase 9 |
| Sentry, Analytics, Cloudflare | Phase 9/11 |

এগুলো নিয়ে এখন ভাবতে হবে না — যেই Phase-এ পৌঁছাবে, তখন ঠিক এই রকম step-by-step guide দিয়ে দেব।
