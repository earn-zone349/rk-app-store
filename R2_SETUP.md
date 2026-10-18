# R2_SETUP.md — APK Storage Migration to Cloudflare R2

এই migration-এর পর থেকে **সব APK ফাইল সরাসরি browser থেকে Cloudflare R2-তে আপলোড হয়**, Supabase Storage একদমই ছোঁয় না। Icon/screenshot এখনও Supabase-এই থাকবে (ছোট ফাইল, egress cost কোনো সমস্যা না) — শুধু APK সরানো হয়েছে, ইচ্ছাকৃতভাবে, কারণ APK-ই storage-এর আসল খরচ।

## কেন এভাবে করা হলো (presigned URL, edge function দিয়ে সরাসরি upload না)

APK ফাইল ২০০ MB পর্যন্ত হতে পারে। Supabase Edge Function-এর নিজের request body size-এর সীমা অনেক ছোট — ফাইল সরাসরি একটা function-এর মধ্য দিয়ে পাঠানো (upload) কাজ করবে না। তাই:
1. Browser প্রথমে একটা ছোট request পাঠায় edge function-কে ("আমি এই নামের একটা ফাইল আপলোড করতে চাই")
2. Edge function শুধু একটা **সাময়িক, sign করা URL** ফেরত দেয় (১০ মিনিটের জন্য বৈধ) — ফাইলের একটা বাইটও এই ধাপে move হয় না
3. Browser সরাসরি সেই URL দিয়ে R2-তে ফাইল পাঠায় — Cloudflare-এর সার্ভারে সরাসরি, আমাদের নিজের কোনো সার্ভার মাঝখানে থাকে না

## ধাপ ১ — R2 Bucket বানাও (ফ্রি, প্রতি মাসে ১০ GB পর্যন্ত)

1. https://dash.cloudflare.com এ যাও (একাউন্ট না থাকলে ফ্রি বানাও)
2. বাম মেনু থেকে **R2 Object Storage**
3. **Create bucket** — নাম দাও (যেমন `rk-app-store-apks`), Location: Automatic
4. তৈরি হয়ে গেলে bucket-এর **Settings** ট্যাবে যাও

## ধাপ ২ — Public Access চালু করো (ডাউনলোড লিংকের জন্য)

APK ফাইল public হতে হবে, নাহলে কেউ ডাউনলোড করতে পারবে না:

1. Bucket → **Settings** → **Public access** সেকশন
2. **R2.dev subdomain** → **Allow Access** চাপো (এটা তোমাকে একটা `https://pub-xxxxxxxx.r2.dev` URL দেবে — এটাই তোমার `R2_PUBLIC_URL`)
3. (ঐচ্ছিক, পরে করা যায়) নিজের domain ব্যবহার করতে চাইলে **Custom Domains** থেকে একটা subdomain (যেমন `cdn.tomarwebsite.com`) যোগ করা যায় — r2.dev subdomain-এর চেয়ে বেশি নির্ভরযোগ্য এবং rate-limit কম

## ধাপ ৩ — CORS কনফিগার করো (⚠️ সবচেয়ে বেশি মিস হওয়া ধাপ)

Browser থেকে সরাসরি R2-তে upload করতে হলে bucket-কে বলতে হবে যে তোমার ওয়েবসাইটের origin থেকে request আসা ঠিক আছে — এটা ছাড়া upload browser-এ CORS error দিয়ে আটকে যাবে।

Bucket → **Settings** → **CORS Policy** → **Add CORS policy** → এই JSON বসাও (তোমার domain বসিয়ে, dev-এর জন্য localhost-ও রাখো):

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:5173",
      "https://username.github.io"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Custom domain বা production URL বদলালে এই লিস্টেও যোগ করতে ভুলো না।

## ধাপ ৪ — API Token বানাও (upload sign করার জন্য, সার্ভার-সাইড)

1. R2 → **Manage R2 API Tokens** → **Create API Token**
2. Permission: **Object Read & Write**
3. শুধু তোমার bucket-এ scope করে দাও (আরও নিরাপদ — সব bucket না)
4. তৈরি হলে তিনটা জিনিস পাবে: **Access Key ID**, **Secret Access Key**, এবং **Account ID** (dashboard-এর ডান পাশে/URL-এও পাওয়া যায়)

## ধাপ ৫ — Supabase secrets সেট করো

```bash
supabase secrets set R2_ACCOUNT_ID=তোমার-account-id
supabase secrets set R2_ACCESS_KEY_ID=তোমার-access-key-id
supabase secrets set R2_SECRET_ACCESS_KEY=তোমার-secret-access-key
supabase secrets set R2_BUCKET_NAME=rk-app-store-apks
supabase secrets set R2_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev
```

**⚠️ `R2_SECRET_ACCESS_KEY` কখনো `.env`-এ, `VITE_` prefix দিয়ে, বা git-এ রাখবে না** — এটা দিয়ে যে কেউ তোমার bucket-এ যা খুশি লিখতে/মুছতে পারবে। শুধু Supabase secret হিসেবেই থাকবে।

## ধাপ ৬ — migration ও function deploy করো

```sql
-- SQL Editor-এ 0011 পর্যন্ত সব আগে থেকেই চলা থাকা উচিত।
-- এখনই 0014_r2_cleanup.sql চালিও না — ধাপ ৭-এ টেস্ট করার পর চালাবে।
```

```bash
supabase functions deploy r2-presign-upload
```

## ধাপ ৭ — টেস্ট করা (এবং তারপর পুরনো bucket বন্ধ করা)

1. একটা developer account দিয়ে একটা test app submit করো, ছোট একটা APK আপলোড করো
2. R2 Dashboard → তোমার bucket-এ গিয়ে দেখো ফাইলটা সত্যিই আছে কিনা
3. App-এর download link (public R2 URL) ব্রাউজারে খুলে ফাইলটা ডাউনলোড হয় কিনা চেক করো
4. **সব ঠিক থাকলে**, SQL Editor-এ `0014_r2_cleanup.sql` চালাও — এটা পুরনো Supabase `apks` bucket-এর upload policy বন্ধ করে দেবে, যাতে ভুলেও কোনো APK আর Supabase-এ না যায়

## সমস্যা হলে

- **CORS error browser console-এ** → ধাপ ৩ আবার দেখো, তোমার আসল domain (dev/prod দুটোই) AllowedOrigins-এ আছে কিনা
- **403 Forbidden upload করার সময়** → API token-এর permission "Object Read & Write" এবং সঠিক bucket-এ scoped কিনা চেক করো
- **Download link কাজ করছে না** → ধাপ ২ (Public Access) ঠিকভাবে চালু করা হয়েছে কিনা, আর `R2_PUBLIC_URL` secret-টা ঠিক subdomain কিনা চেক করো
