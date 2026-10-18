# FCM_SETUP.md — Push Notifications (step #69)

App approve/reject/suspend হলে developer-কে push notification পাঠাতে Firebase Cloud Messaging (FCM) ব্যবহার করা হয়েছে — email না (এটা ইচ্ছাকৃত সিদ্ধান্ত, invoice-ও তাই email-এর বদলে in-app receipt পাতা হিসেবে বানানো হয়েছে, দেখো Receipt.tsx)।

## ধাপ ১ — Firebase Project বানাও (ফ্রি)

1. https://console.firebase.google.com এ যাও, **Add project**
2. প্রজেক্টের নাম দাও (যেমন "RK App Store"), Google Analytics চাইলে skip করতে পারো
3. তৈরি হয়ে গেলে, **⚙️ Project Settings**-এ যাও

## ধাপ ২ — Web app যোগ করো (client-side config পাওয়ার জন্য)

1. Project Settings-এর **General** ট্যাবে, "Your apps" সেকশনে **</> (Web)** আইকনে ক্লিক করো
2. একটা নাম দাও, register করো
3. যে config object দেখাবে (`apiKey`, `authDomain`, `projectId`, ইত্যাদি) — এগুলো **`.env`**-এ বসাও:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

4. **এই একই মানগুলো** `public/firebase-messaging-sw.js` ফাইলেও বসাও (`তোমার-firebase-api-key` ইত্যাদি জায়গায়) — service worker Vite-এর `.env` পড়তে পারে না, তাই এখানে সরাসরি বসাতে হয়।

## ধাপ ৩ — Web Push সক্রিয় করো (VAPID key)

1. Project Settings → **Cloud Messaging** ট্যাব
2. "Web configuration" সেকশনে **Generate key pair** চাপো
3. যে key পাবে সেটা `.env`-এ বসাও:
```
VITE_FIREBASE_VAPID_KEY=...
```

## ধাপ ৪ — Service Account বানাও (notification *পাঠানোর* জন্য, সার্ভার-সাইড)

এটা আলাদা — উপরেরগুলো শুধু browser-এ token *নেওয়ার* জন্য, এটা লাগবে server থেকে *পাঠানোর* জন্য।

1. Project Settings → **Service Accounts** ট্যাব
2. **Generate new private key** চাপো — একটা `.json` ফাইল ডাউনলোড হবে
3. সেই JSON ফাইল থেকে তিনটা জিনিস নাও: `project_id`, `client_email`, `private_key`
4. Supabase secret হিসেবে সেট করো:

```bash
supabase secrets set FCM_PROJECT_ID=তোমার-project-id
supabase secrets set FCM_CLIENT_EMAIL=তোমার-client-email
supabase secrets set FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
...পুরো key...
-----END PRIVATE KEY-----"
```

**⚠️ এই `.json` ফাইলটা কখনো `.env`-এ, git-এ, বা `VITE_` prefix দিয়ে কোথাও রাখবে না** — এটা দিয়ে যে কেউ তোমার Firebase project-এর হয়ে notification পাঠাতে পারবে। শুধু Supabase secret হিসেবেই থাকবে।

## ধাপ ৫ — migration চালাও ও deploy করো

```sql
-- SQL Editor-এ:
-- supabase/migrations/0011_phase_gaps.sql পুরোটা Run করো
```

```bash
npm install   # firebase package যোগ হয়েছে package.json-এ
supabase functions deploy admin-action
```

## ধাপ ৬ — test করা

1. একটা developer account দিয়ে লগইন করো, Dashboard-এ "🔔 Notification চালু করো" বাটনে চাপ দাও, browser permission দাও
2. Admin দিয়ে সেই developer-এর কোনো app approve/reject/suspend করো
3. কয়েক সেকেন্ডের মধ্যে browser notification আসা উচিত (ট্যাব বন্ধ থাকলেও — background handler `firebase-messaging-sw.js`-এ আছে)

## Notification না এলে

- `FCM_PROJECT_ID`/`FCM_CLIENT_EMAIL`/`FCM_PRIVATE_KEY` তিনটাই ঠিকভাবে set হয়েছে কিনা check করো (`supabase secrets list`)
- Browser-এ notification permission "block" করা আছে কিনা দেখো (address bar-এর পাশে lock আইকনে ক্লিক করে চেক করা যায়)
- Supabase Dashboard → Edge Functions → `admin-action` → Logs-এ error দেখো — FCM configured না থাকলে এটা silently skip করে (কোনো error না দিয়ে), তাই log-এ "FCM not configured" লেখা থাকলে বুঝবে secret ঠিকভাবে set হয়নি
