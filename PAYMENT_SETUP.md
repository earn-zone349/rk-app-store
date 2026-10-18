# PAYMENT_SETUP.md — Phase 4 (Developer System) & Phase 5 (Payments)

এই guide `SETUP.md`-এর ধারাবাহিকতা। ধরে নিচ্ছি Phase 3 (Supabase project, `0001_init.sql`, `0002_storage_policies.sql`) আগেই শেষ করেছ।

## এই সিস্টেমটা কীভাবে কাজ করে (আগে বুঝে নাও)

- **`app_settings`** নামে একটা টেবিলে একটামাত্র সুইচ থাকে: `payment_enabled` (true/false)। এটা **false** থাকা অবস্থায় শুধু **তুমি** (owner) app publish করতে পারবে, আর কেউ না — অন্য কেউ registration করলেও তাদের "Add New App" বাটনই আসবে না।
- **তুমি নিজে** (`developers.is_owner = true`) সবসময় publish করতে পারবে, `payment_enabled` যা-ই থাক।
- এই পুরো নিয়ম **database-এর ভেতরেই (RLS দিয়ে) জোর করা**, শুধু frontend-এর UI লুকানো না — মানে কেউ চেষ্টা করলেও সরাসরি API call করে bypass করতে পারবে না।
- `payment_enabled` **true** করার পর, যেসব developer টাকা দিয়েছে (`payment_status = 'paid'`) তারাই শুধু publish করতে পারবে।

**এক ক্লিকে চালু করা মানে:** ভবিষ্যতে SQL Editor-এ গিয়ে একটা লাইন চালানো —
```sql
update app_settings set payment_enabled = true;
```
— এটাই। কোনো নতুন code লাগবে না।

---

## ধাপ ১ — নতুন migration ৪টা চালাও

Supabase Dashboard → **SQL Editor** এ গিয়ে, এই ক্রমে চালাও:

1. `supabase/migrations/0003_payment_gating.sql` — পুরো content copy-paste করে **Run**
2. `supabase/migrations/0004_seed_categories.sql` — একইভাবে **Run**
3. `supabase/migrations/0005_protect_admin_columns.sql` — একইভাবে **Run**
4. `supabase/migrations/0006_tighten_storage_uploads.sql` — একইভাবে **Run**

⚠️ **তিন নম্বরটা বাদ দেওয়া যাবে না।** এটা ছাড়া যেকোনো signed-in developer browser-এর console থেকে সরাসরি নিজেকে `is_owner = true` বানিয়ে ফেলতে পারবে, বা নিজের app-এর status নিজেই `approved` করে দিতে পারবে — পুরো payment gate আর admin review পুরোপুরি bypass হয়ে যাবে। এই migration সেটা database-level-এ বন্ধ করে দেয়।

চার নম্বরটা (0006) icon/screenshot/APK আপলোডকেও একই নিয়মে আটকে দেয় — শুধু owner বা paid developer-ই ফাইল আপলোড করতে পারবে, নাহলে storage-এ অপ্রয়োজনীয় ফাইল জমা হতে পারত।

## ধাপ ২ — নিজেকে "Owner" হিসেবে চিহ্নিত করা

1. তোমার app-টাতে (localhost বা deployed link) গিয়ে **নিজে একবার Sign up করো** (`/signup`)
2. লগইন করে **/developer** পাতায় যাও → **Developer হিসেবে নিবন্ধন করো** (নিজের নাম/স্টুডিওর নাম দিয়ে)
3. এবার Supabase Dashboard → **SQL Editor**-এ গিয়ে এই query চালাও:
   ```sql
   update developers set is_owner = true
   where user_id = (select id from auth.users where email = 'তোমার-signup-email@example.com');
   ```
   (নিজের signup-এ ব্যবহার করা email-টা বসাও)
4. আবার `/developer` পাতায় ফিরে গেলে এখন "+ নতুন App যোগ করুন" বাটন দেখতে পাবে — payment_enabled false থাকলেও, কারণ তুমি এখন owner

এখন থেকে **শুধু তুমিই** app submit করতে পারবে, অন্য কেউ registration করলেও তাদের এই বাটন আসবে না (উপরে `PublishGateNotice` বার্তা দেখবে)।

## ধাপ ৩ — নিজের App যোগ করা

`/developer/apps/new` এ গিয়ে ফর্ম পূরণ করলেই (icon, screenshot, APK আপলোড সহ) app টা `pending` status-এ তৈরি হয়ে যাবে। (Admin approve করার ফিচার Phase 7-এ আসবে — আপাতত pending থাকলেও Dashboard-এ দেখা যাবে।)

---

## ধাপ ৪ — SSLCommerz Sandbox Account (টাকা ছাড়াই টেস্ট করা যায়)

Real business verification লাগার আগে **Sandbox/Test account** দিয়েই পুরো flow টেস্ট করা যায়:

1. https://developer.sslcommerz.com/registration/ এ গিয়ে একটা **Sandbox account** খোলো (এটা test account, business verification লাগে না, সাথে সাথে পাওয়া যায়)
2. Login করে Dashboard থেকে **Store ID** আর **Store Password** কপি করে রাখো

## ধাপ ৫ — দুটো Edge Function deploy করা (Codespace থেকেই)

Edge Function হলো ছোট server-side code যেটা SSLCommerz-এর সাথে নিরাপদে কথা বলে (Store Password browser-এ কখনো যাবে না)। Codespace terminal-এ:

```bash
npm install -g supabase
supabase login
```

(এটা তোমাকে একটা লিংক দেবে, browser-এ খুলে অনুমতি দিলেই terminal-এ ফিরে আসবে)

```bash
supabase link --project-ref তোমার-প্রজেক্ট-রেফ
```

(project ref পাবে Supabase Dashboard → Project Settings → General → Reference ID)

এবার দুটো secret বসাও:

```bash
supabase secrets set SSLCOMMERZ_STORE_ID=তোমার-sandbox-store-id
supabase secrets set SSLCOMMERZ_STORE_PASSWORD=তোমার-sandbox-store-password
supabase secrets set SSLCOMMERZ_IS_LIVE=false
supabase secrets set PUBLIC_SITE_URL=http://localhost:5173
```

(পরে সাইট deploy হয়ে গেলে `PUBLIC_SITE_URL` real domain দিয়ে update করবে, আর real business account পেলে `SSLCOMMERZ_IS_LIVE=true` করবে)

এবার দুটো function deploy করো:

```bash
supabase functions deploy sslcommerz-init
supabase functions deploy sslcommerz-ipn --no-verify-jwt
```

⚠️ **`sslcommerz-ipn`-এ `--no-verify-jwt` অবশ্যই লাগবে** — কারণ SSLCommerz সরাসরি server-থেকে-server এই ফাংশনকে কল করে, কোনো login token ছাড়া। এই ফাংশন নিজেই SSLCommerz-এর Validation API দিয়ে যাচাই করে নেয় request-টা আসল কিনা, তাই এটা নিরাপদ।

## ধাপ ৬ — Fee ও পরীক্ষা করা

1. `app_settings` টেবিলে fee-এর ডিফল্ট মান আছে ৫০০ BDT — বদলাতে চাইলে:
   ```sql
   update app_settings set developer_fee_amount = 500, developer_fee_currency = 'BDT';
   ```
2. একটা দ্বিতীয় (test) email দিয়ে নতুন Sign up + Developer registration করো
3. `app_settings.payment_enabled` সাময়িকভাবে **true** করে দাও:
   ```sql
   update app_settings set payment_enabled = true;
   ```
4. Test developer account দিয়ে `/developer` পাতায় গিয়ে "পে করুন" বাটনে চাপো — SSLCommerz-এর sandbox checkout page-এ নিয়ে যাবে
5. SSLCommerz sandbox-এ **টেস্ট card/mobile banking তথ্য** দিয়ে payment simulate করা যায় (sandbox dashboard-এ নমুনা card number দেওয়া থাকে)
6. Payment সফল হলে `/developer?payment=success`-এ ফিরে আসবে, আর কয়েক সেকেন্ডের মধ্যে `payment_status = 'paid'` হয়ে যাবে, "+ নতুন App যোগ করুন" বাটন চলে আসবে

---

## আসল Payment চালু করার সময় (ভবিষ্যতে)

যখন real SSLCommerz merchant account (business verification-সহ) পাবে:

```bash
supabase secrets set SSLCOMMERZ_STORE_ID=তোমার-real-store-id
supabase secrets set SSLCOMMERZ_STORE_PASSWORD=তোমার-real-store-password
supabase secrets set SSLCOMMERZ_IS_LIVE=true
supabase secrets set PUBLIC_SITE_URL=https://তোমার-real-domain.com
```

আর marketplace সবার জন্য খুলতে (আগে decide করে নিও প্রস্তুত কিনা):

```sql
update app_settings set payment_enabled = true;
```

**এটুকুই।** কোনো নতুন code, নতুন deploy, বা component বদলানো লাগবে না — পুরো Phase 4-5 আগে থেকেই এইদিন-এর জন্য তৈরি করা।
