const SECTIONS = [
  { title: '১. Publishing Fee', body: 'প্রতিটা app প্রকাশ করতে একটা one-time fee দিতে হয় (dashboard-এ সঠিক অঙ্ক দেখানো হয়)। এই fee অ-ফেরতযোগ্য, app approve হোক বা reject — কারণ এটা review প্রক্রিয়ার খরচ কভার করে, প্রতিশ্রুত approval না।' },
  { title: '২. Review প্রক্রিয়া', body: 'প্রতিটা APK স্বয়ংক্রিয়ভাবে VirusTotal দিয়ে scan হয় এবং একজন admin ম্যানুয়ালি review করে। Approve/reject/suspend-এর কারণ dashboard-এ দেখানো হবে। Review-এর সময়সীমা নির্দিষ্ট করা নেই, তবে সাধারণত কয়েক কর্মদিবসের মধ্যে হয়।' },
  { title: '৩. Ownership ও Content দায়িত্ব', body: 'App-এর কোড, ডিজাইন, ও কনটেন্টের মালিকানা developer-এর কাছেই থাকে। কিন্তু কপিরাইট লঙ্ঘন বা তৃতীয় পক্ষের অভিযোগের ক্ষেত্রে সম্পূর্ণ আইনি দায়ভার developer-এর, RK App Store-এর না।' },
  { title: '৪. Verified Badge', body: '"Verified" badge admin manual review-এর মাধ্যমে দেওয়া হয় (সাধারণত NID/Trade License যাচাই করে)। এটা কোনো নিশ্চয়তা না যে app-এ কোনো bug নেই — এটা শুধু developer identity যাচাই নির্দেশ করে।' },
  { title: '৫. Suspension', body: 'নীতি লঙ্ঘন, বারবার user report, বা malware পাওয়া গেলে যেকোনো সময় app suspend করা হতে পারে, কারণসহ dashboard-এ জানানো হবে। Developer আপত্তি জানাতে Contact পাতার মাধ্যমে যোগাযোগ করতে পারবে।' },
]

export default function DeveloperTerms() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-xl font-semibold">Developer Terms</h1>
      <p className="mb-6 rounded-card border border-signal-amber/30 bg-signal-amber/10 p-3 text-xs text-signal-amber">
        এটি একটি শুরুর টেমপ্লেট। Refund policy ও VAT-সংক্রান্ত ধারা ইচ্ছাকৃতভাবে এখানে যোগ করা হয়নি — সেগুলো নিয়ে সিদ্ধান্ত হলে এই পাতায় যোগ করা হবে।
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
