const SECTIONS = [
  {
    title: '১. আমরা কী তথ্য সংগ্রহ করি',
    body: `অ্যাকাউন্ট তৈরির সময় ইমেইল ঠিকানা। Developer হিসেবে registration করলে: developer-এর নাম, ফোন নম্বর, ওয়েবসাইট (ঐচ্ছিক), এবং ভেরিফিকেশনের জন্য ঐচ্ছিকভাবে জমা দেওয়া NID/Trade License ডকুমেন্ট। কোনো app-এ review/rating দিলে: তোমার নাম (যা তুমি নিজে লেখো) এবং review-এর লেখা। কোনো app report করলে: report-এর কারণ।`,
  },
  {
    title: '২. তথ্য কীভাবে ব্যবহার করা হয়',
    body: `অ্যাকাউন্ট পরিচালনা, app review/approval প্রক্রিয়া, payment যাচাই, নিরাপত্তা (যেমন malware scan) এবং তোমাকে app-এর status সম্পর্কে notification পাঠানোর জন্য। তোমার তথ্য কোনো তৃতীয় পক্ষের কাছে বিক্রি করা হয় না।`,
  },
  {
    title: '৩. তথ্য কোথায় সংরক্ষিত হয়',
    body: `Database ও ফাইল Supabase-এ (cloud hosting), payment SSLCommerz-এর মাধ্যমে প্রসেস হয় (কার্ড/bKash-এর তথ্য আমাদের সার্ভারে সরাসরি আসে না), আর push notification পাঠানোর জন্য Firebase Cloud Messaging ব্যবহার করা হয়।`,
  },
  {
    title: '৪. তোমার অধিকার',
    body: `তুমি নিজের review/report যেকোনো সময় ডিলিট করতে পারো। অ্যাকাউন্ট সম্পূর্ণ মুছে ফেলার অনুরোধ করতে চাইলে নিচের Contact ঠিকানায় যোগাযোগ করো।`,
  },
  {
    title: '৫. নিরাপত্তা',
    body: `আপলোড করা প্রতিটা APK ফাইল VirusTotal দিয়ে স্ক্যান করা হয়, developer account CAPTCHA ও rate-limiting দিয়ে সুরক্ষিত, আর admin panel দুই-ধাপের ভেরিফিকেশন (password + authenticator code) ছাড়া প্রবেশযোগ্য না।`,
  },
]

export default function PrivacyPolicy() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-xl font-semibold">Privacy Policy</h1>
      <p className="mb-6 rounded-card border border-signal-amber/30 bg-signal-amber/10 p-3 text-xs text-signal-amber">
        এটি একটি শুরুর টেমপ্লেট — store চালু করার আগে একজন আইনজীবীর মাধ্যমে review করিয়ে নেওয়া উচিত, বিশেষ করে Bangladesh-এর Digital Security Act ও data-protection সংক্রান্ত নিয়ম মেনে চলার জন্য।
      </p>

      <div className="flex flex-col gap-6">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="mb-1 font-medium">{section.title}</h2>
            <p className="text-sm leading-relaxed text-ink/70">{section.body}</p>
          </section>
        ))}
      </div>

      <p className="mt-8 text-xs text-ink/40">সর্বশেষ আপডেট: {new Date().toLocaleDateString('bn-BD')}</p>
    </div>
  )
}
