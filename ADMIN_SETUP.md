# ADMIN_SETUP.md — Phase 7 (Admin Panel)

এই guide ধরে নিচ্ছে Phase 1-6 আগেই শেষ (SETUP.md, PAYMENT_SETUP.md, SECURITY_SETUP.md অনুসরণ করে)।

## Phase 7-এ কী কী যোগ হলো

| পাতা | কী করে |
|---|---|
| `/admin/login` | Email+password, তারপর ৬-সংখ্যার authenticator কোড |
| `/admin` | Dashboard — কতগুলো app pending/approved/rejected, সাম্প্রতিক কার্যক্রম |
| `/admin/apps` | পর্যালোচনার অপেক্ষায় থাকা app-গুলোর queue |
| `/admin/apps/:id` | একটা app-এর পুরো বিবরণ + Phase 6-এর security scan ফলাফল + Approve/Reject/Suspend/Feature |
| `/admin/audit-log` | প্রতিটা admin action-এর স্থায়ী রেকর্ড |

---

## ধাপ ১ — migration চালাও

Supabase Dashboard → **SQL Editor** → `supabase/migrations/0009_admin_system.sql` পুরোটা paste করে **Run**।

## ধাপ ২ — নিজেকে প্রথম admin বানাও

**প্রথমে সাধারণ signup দিয়ে একটা account বানাও** (`/signup` দিয়ে, ঠিক যেভাবে একজন developer বানাত) — তোমার admin login-ও একই email/password ব্যবহার করবে।

তারপর SQL Editor-এ এই কমান্ড চালাও (নিজের email আর নাম বসিয়ে):

```sql
select bootstrap_first_admin('tumi@example.com', 'তোমার নাম');
```

এটা দুটো জিনিস ফেরত দেবে — **`totp_secret`** আর **`otpauth_uri`**। **এটা এখনই কপি করে রাখো — আর কখনো দেখানো হবে না** (Google/GitHub 2FA setup-ও ঠিক একই রকম — একবারই দেখায়)।

## ধাপ ৩ — Authenticator app-এ যোগ করো

তোমার ফোনে **Google Authenticator**, **Authy**, বা যেকোনো TOTP app খোলো →
- **"Enter setup key manually"** বেছে নাও (QR code স্ক্যান করার অপশনও চাইলে পরে যোগ করা যায়, এখন শুধু raw secret দিয়েই কাজ চলবে)
- Account name: `RK App Store` (বা যা খুশি)
- Key: ধাপ ২-এর `totp_secret`
- Type: **Time based**

App-টা এখন প্রতি ৩০ সেকেন্ডে একটা নতুন ৬-সংখ্যার কোড দেখাবে — এটাই তুমি `/admin/login`-এ দ্বিতীয় ধাপে দেবে।

## ধাপ ৪ — Edge Functions deploy করা

```bash
supabase functions deploy admin-verify-totp
supabase functions deploy admin-enroll
supabase functions deploy admin-action
```

(এগুলোর কোনোটার জন্য নতুন secret লাগে না — যা আগে থেকেই সেট করা আছে (SUPABASE_SERVICE_ROLE_KEY, ইত্যাদি Supabase নিজেই inject করে) তা দিয়েই চলবে।)

## ধাপ ৫ — test করা

1. `/admin/login`-এ গিয়ে email+password দাও
2. Authenticator app থেকে বর্তমান কোডটা দাও
3. Dashboard দেখা উচিত — pending count ইত্যাদি
4. একটা developer account দিয়ে একটা test app submit করো (Phase 4/5-এর মতো), তারপর admin দিয়ে `/admin/apps`-এ গিয়ে সেটা দেখো, Approve করে দেখো app-টা এখন সাইটে public-এ দেখা যাচ্ছে কিনা

---

## দ্বিতীয় admin যোগ করা (পরে দরকার হলে)

কোনো UI বাটন নেই এটার জন্য ইচ্ছাকৃতভাবে — admin যোগ করা একটা সহজলভ্য বাটন হওয়া উচিত না। প্রথমে ওই ব্যক্তিকে সাধারণ `/signup` দিয়ে একটা account বানাতে বলো, তারপর তুমি (বিদ্যমান admin হিসেবে লগইন করা অবস্থায়) এই কমান্ড চালাও:

```bash
curl -X POST https://তোমার-প্রজেক্ট.supabase.co/functions/v1/admin-enroll \
  -H "Authorization: Bearer তোমার-নিজের-supabase-session-token" \
  -H "Content-Type: application/json" \
  -d '{"email": "notun-admin@example.com", "label": "নতুন admin-এর নাম"}'
```

(নিজের session token ব্রাউজারের dev tools থেকে পাওয়া যায় — Application → Local Storage → `sb-...-auth-token` এর ভেতরে `access_token`।) Response-এ একটা নতুন `totpSecret` পাবে, যেটা ওই নতুন admin-কে নিরাপদে (যেমন Signal/WhatsApp-এ, email-এ না) পাঠিয়ে দাও — সে ধাপ ৩-এর মতো নিজের authenticator app-এ যোগ করে নেবে।

---

## TOTP আসলে কী protect করে — honest threat model

**যা protect করে:** কারো কাছে যদি admin-এর password ফাঁস হয়ে যায় (phishing, একই password অন্য কোথাও ব্যবহার করা ইত্যাদি), সে তাও `/admin/login`-এর দ্বিতীয় ধাপ পার হতে পারবে না — কারণ তার কাছে admin-এর physical authenticator device নেই।

**যা protect করে না:** TOTP নিজে থেকে কাউকে "admin ক্ষমতা" দেয় না বা কেড়ে নেয় না — সেই আসল ক্ষমতার জায়গাটা হলো `admins` টেবিলের row (database-এ) আর `admin-action` function-এর ভেতরের `is_admin()` চেক। কেউ যদি কোনোভাবে (এই UI বাদ দিয়ে) সরাসরি Supabase-এ login করে একটা valid session বানিয়ে ফেলে, সে তাও app approve/reject করতে পারবে না যদি না সে আসলেই `admins` টেবিলে থাকে — TOTP দিয়েছে কি দেয়নি সেটা তখন কোনো ব্যাপার না। মানে **সত্যিকারের security boundary database-এ, TOTP হলো একটা এক্সট্রা layer শুধু login screen-এর জন্য।**
