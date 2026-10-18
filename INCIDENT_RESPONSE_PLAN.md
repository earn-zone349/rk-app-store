# INCIDENT_RESPONSE_PLAN.md

এই ফাইলটা **internal** — repo-তে থাকবে কিন্তু কোনো public পাতায় link করা হবে না (bracketed জায়গাগুলো তোমার নিজের তথ্য দিয়ে ভরে নাও)।

## কখন এই plan ব্যবহার করবে

- কোনো app malware/virus হিসেবে চিহ্নিত হয়েছে **VirusTotal scan-এর পরেও** approve হয়ে গেছে (scan bypass বা false-negative)
- কোনো developer account compromised হয়েছে বলে সন্দেহ
- Database/storage-এ unauthorized access-এর প্রমাণ
- একসাথে অনেক user "আমার ডেটা leak হয়েছে" বলে রিপোর্ট করছে
- Payment gateway-তে সন্দেহজনক লেনদেন

---

## ধাপ ১ — Contain (থামাও)

| পরিস্থিতি | কী করবে | কোথা থেকে |
|---|---|---|
| একটা নির্দিষ্ট app malware ছড়াচ্ছে | সাথে সাথে **Suspend** করো | `/admin/apps/:id` → Suspend বাটন (কারণ লিখে) |
| একটা developer account সন্দেহজনক | তার সব app suspend করো, verified badge সরাও | `/admin/apps` + `/admin/developers` |
| পুরো site-এ সমস্যা (বড় আকারের) | Supabase project সাময়িকভাবে pause করো | Supabase Dashboard → Project Settings |
| কোনো admin account compromised | সেই admin-এর row `admins` table থেকে delete করো (SQL Editor) | Supabase SQL Editor |

## ধাপ ২ — Assess (কতটা ক্ষতি হয়েছে বোঝা)

1. `/admin/audit-log` চেক করো — কে, কখন, কী করেছে
2. Supabase Dashboard → Logs → Postgres Logs / Edge Function Logs চেক করো অস্বাভাবিক activity-র জন্য
3. যদি malware app-এর কথা হয়: কতজন download করেছে (`app_versions`-এর download count), কবে থেকে live ছিল
4. যদি payment-সংক্রান্ত: SSLCommerz Merchant Panel-এ গিয়ে transaction history মিলিয়ে দেখো

## ধাপ ৩ — Notify (কাকে জানাবে)

| কাকে | কখন | কীভাবে |
|---|---|---|
| প্রভাবিত user-রা | Malware download হয়ে থাকলে | (email service নেই — homepage-এ banner announcement বিবেচনা করো, অথবা এখন email service যোগ করার এটাই কারণ হতে পারে) |
| SSLCommerz | Payment fraud সন্দেহ হলে | [তোমার merchant panel-এর support contact] |
| আইনি বাধ্যবাধকতা থাকলে | Data breach হলে (ব্যক্তিগত তথ্য leak) | [তোমার আইনজীবীর নম্বর — #81 হয়ে গেলে এখানে বসাও] |

## ধাপ ৪ — Recover

1. যে দুর্বলতার কারণে ঘটেছে সেটা ঠিক করো (কোড ফিক্স/migration)
2. Suspend করা app/developer-দের নিয়ে সিদ্ধান্ত নাও — স্থায়ী নাকি temporary
3. ঠিক থাকলে `/admin/apps/:id` থেকে আবার Approve করা যায়

## ধাপ ৫ — Document

প্রতিটা incident-এর জন্য নিচের ছকটা পূরণ করে রাখো (এই ফাইলেই নিচে যোগ করতে পারো, বা আলাদা লগ):

```
তারিখ:
কী হয়েছিল:
কীভাবে ধরা পড়েছে:
কতজন প্রভাবিত হয়েছে (আনুমানিক):
কী পদক্ষেপ নেওয়া হয়েছে:
ভবিষ্যতে এড়াতে কী বদলানো হলো:
```

---

## জরুরি যোগাযোগ (নিজের তথ্য দিয়ে ভরো)

- Supabase support: https://supabase.com/support
- SSLCommerz support: [ফোন/ইমেইল]
- Cloudflare (R2) support: https://dash.cloudflare.com/support
- আইনজীবী: [#81 হয়ে গেলে বসাও]
- নিজের জরুরি নম্বর: [তোমার/team-এর ফোন নম্বর]
