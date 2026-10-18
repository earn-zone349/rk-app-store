# SECURITY_SETUP.md — Phase 6 (Security)

এই guide ধরে নিচ্ছে Phase 3-5 আগেই শেষ (SETUP.md ও PAYMENT_SETUP.md অনুসরণ করে) — মানে `0001` থেকে `0006` পর্যন্ত সব migration চালানো আছে।

## Phase 6-এ কী কী যোগ হলো

| Step | কী | কোথায় |
|---|---|---|
| 41 | APK validation (magic-byte, শুধু extension না) | `src/utils/apkValidation.ts` |
| 42 | Metadata extraction (package name, SDK version) | `src/utils/apkParser.ts` |
| 43 | Hash (SHA-256) | আগে থেকেই ছিল (`src/utils/hash.ts`) |
| 44 | Duplicate detection | `src/services/security.ts` + DB unique constraint |
| 45 | Malware/security scanning | `supabase/functions/virustotal-scan` |
| 46 | Upload restrictions (size/type) | আগে থেকেই ছিল (`storage.ts`), আরও শক্ত করা হলো |
| 47 | Signature/certificate fingerprint | দেখো "যা বাদ পড়েছে" নিচে |
| 48 | VirusTotal API integration | `supabase/functions/virustotal-scan` |
| 49 | Permission extraction ও দেখানো | `apkParser.ts` + `src/components/PermissionsList.tsx` |
| 50 | CAPTCHA | `src/components/Captcha.tsx` (Cloudflare Turnstile) |
| 51 | Rate limiting | `0008_rate_limiting.sql` + `rate-limit-check` function |

---

## ধাপ ১ — নতুন migration চালাও

Supabase Dashboard → **SQL Editor**:

1. `supabase/migrations/0007_security_columns.sql` — **Run**
2. `supabase/migrations/0008_rate_limiting.sql` — **Run**

## ধাপ ২ — `npm install` (নতুন dependency)

APK-এর ভেতরের zip পড়তে `fflate` লাগবে (হালকা, dependency-free zip library):

```bash
npm install
```

(`package.json`-এ আগেই যোগ করা আছে, শুধু install করলেই হবে।)

## ধাপ ৩ — VirusTotal API key নেওয়া (ফ্রি)

1. https://www.virustotal.com/gui/join-us এ গিয়ে একটা ফ্রি account খোলো
2. Login করে নিজের profile আইকনে ক্লিক করে **API key** কপি করো
3. **ফ্রি tier limit মনে রাখো:** প্রতি মিনিটে ৪টা request, দিনে ৫০০টা। ছোট store-এর জন্য যথেষ্ট — অনেক বেশি app submit হতে থাকলে paid tier লাগবে।

## ধাপ ৪ — `virustotal-scan` Edge Function deploy করা

```bash
supabase secrets set VIRUSTOTAL_API_KEY=তোমার-virustotal-api-key
supabase functions deploy virustotal-scan
```

## ধাপ ৫ — Cloudflare Turnstile (CAPTCHA) সেটআপ করা (ফ্রি)

1. https://dash.cloudflare.com/ এ একটা ফ্রি account খোলো (domain লাগবে না, "Turnstile" আলাদা product)
2. বাম মেনু থেকে **Turnstile** → **Add Site**
3. Site name দাও, domain-এ তোমার deploy করা URL দাও (localhost-এও টেস্ট করা যায়, ওটাও domain হিসেবে যোগ করো)
4. এখান থেকে দুটো key পাবে:
   - **Site Key** (public) → `.env`-এ `VITE_TURNSTILE_SITE_KEY=...`
   - **Secret Key** (private) → এটা .env-এ **না**, বরং নিচের ধাপে Supabase-এ বসবে

## ধাপ ৬ — Supabase Auth-এ Turnstile চালু করা

Supabase Dashboard → **Authentication** → **Attack Protection** (বা Settings-এর ভেতরে CAPTCHA সেকশন) →
- **Enable CAPTCHA protection**
- Provider: **Turnstile**
- Secret key: ধাপ ৫-এর Secret Key বসাও
- Save

এটা চালু করার পর Signup.tsx-এর CAPTCHA widget আসলেই কাজ করবে — চালু করার আগ পর্যন্ত widget দেখাবে ঠিকই, কিন্তু Supabase token verify করবে না (harmless, কিন্তু protection ও থাকবে না)।

## ধাপ ৭ — `rate-limit-check` Edge Function deploy করা

```bash
supabase functions deploy rate-limit-check --no-verify-jwt
```

`--no-verify-jwt` জরুরি — signup-এর সময় কেউ এখনো লগইন করা থাকে না, তাই JWT verify করা যাবে না। Function নিজেই নিরাপদ (শুধু counter বাড়ায়, আর কিছু করে না)।

## ধাপ ৮ — test করা

1. `/signup`-এ গিয়ে CAPTCHA widget দেখা যাচ্ছে কিনা চেক করো
2. `/developer/apps/new`-এ গিয়ে একটা .apk ফাইল সিলেক্ট করো — কয়েক সেকেন্ডের মধ্যে "✓ APK ফাইল বৈধ" ও permission list দেখা উচিত
3. একই APK আবার আপলোড করার চেষ্টা করলে "আগে থেকেই আপলোড করা আছে" বার্তা আসা উচিত
4. App submit করার পর কিছুক্ষণ পর (৩০-৯০ সেকেন্ড) Supabase Dashboard → Table Editor → `app_versions`-এ গিয়ে `security_status` কলাম চেক করো — `pending` → `scanning` → `clean`/`flagged` এভাবে বদলানো উচিত

---

---

## বড় APK ফাইল সম্পর্কে জেনে রাখা ভালো

- **৩২MB-এর বেশি APK:** VirusTotal-এর সাধারণ upload endpoint ৩২MB-এ cap করা — `virustotal-scan` function নিজে থেকেই টা detect করে বড় ফাইলের জন্য আলাদা "upload URL" নেয় (VT-এর নিজস্ব সিস্টেম, ৬৫০MB পর্যন্ত সাপোর্ট করে)। তোমার আলাদা কিছু করতে হবে না — এটা ইতিমধ্যে handle করা আছে।
- **খুব বড় ফাইলে সময় লাগতে পারে:** Edge Function-এর নিজের একটা execution time limit আছে (সাধারণত ~150 সেকেন্ড, Supabase-এর plan অনুযায়ী কমবেশি)। ১৫০-২০০MB-এর APK ডাউনলোড+আপলোড করতে ধীর নেটওয়ার্কে এই সময় ছাড়িয়ে যেতে পারে, তখন `security_status` "error"-এ থেকে যাবে। এমন হলে ব্যবহারকারী "আবার scan করো" বাটনে চাপ দিলে (বা AddApp.tsx থেকে আবার `runVirusScan(id, 'start')` কল করলে) আবার চেষ্টা হবে। বড় store হলে Supabase-এর higher-tier plan-এ function timeout বাড়ানো যায়।

---

## যা এখনো বাদ আছে (roadmap step 47)
**APK signature/certificate fingerprint verification** ইচ্ছাকৃতভাবে বাদ রাখা হয়েছে এই ধাপে। কারণ:

- এটা যাচাই করতে হলে APK-এর `META-INF/*.RSA` বা `META-INF/*.DSA` ফাইল থেকে X.509 certificate বের করে parse করতে হয় — এটা AndroidManifest.xml পড়ার চেয়ে অনেক বেশি জটিল (ASN.1/DER encoding parse করা লাগে), আর আসলে কাজে লাগে মূলত "app update-এর নতুন version-এর সার্টিফিকেট আগেরটার সাথে মিলছে কিনা" — সেটা তুলনা করার মতো, যার জন্য প্রথম version আপলোড হওয়ার পরই বেসলাইন লাগবে।
- চাইলে এটা একটা আলাদা ছোট ধাপ হিসেবে পরে যোগ করা যাবে (`src/utils/apkCertVerify.ts` — `jsrsasign` বা similar লাইব্রেরি দিয়ে), app_versions-এ ইতিমধ্যে `cert_sha256`-এর জন্য জায়গা রাখা হয়নি এখনো — লাগলে বলো, একটা ছোট migration দিয়ে যোগ করে দেব।

**Rate limiting-এর সীমা** (`rate-limit-check/index.ts`-এর `LIMITS` object) শুরুর জন্য reasonable default — real traffic দেখার পর টাইট/লুজ করা লাগতে পারে।
