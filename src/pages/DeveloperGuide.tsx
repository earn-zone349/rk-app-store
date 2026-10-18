const SECTIONS = [
  {
    title: 'শুরু করা',
    items: [
      'সাধারণ ভাবে Sign up করো, তারপর "Developer হও" থেকে profile বানাও।',
      'ঐচ্ছিক: NID/Trade License আপলোড করো — verified badge পেতে সাহায্য করে (Admin manual review করে)।',
      'App submit করার আগে একবার publishing fee দিতে হবে (dashboard-এ অঙ্ক দেখানো থাকে, one-time)।',
    ],
  },
  {
    title: 'App Submission Requirements',
    items: [
      'APK ফাইল সর্বোচ্চ ২০০ MB।',
      'ফাইলটা আসলেই একটা valid APK (zip) হতে হবে — শুধু .apk extension দিলে হবে না, আমরা ফাইলের ভেতরের কনটেন্টও চেক করি।',
      'একই APK (একই SHA-256 hash) আগে থেকে আপলোড করা থাকলে আবার আপলোড করা যাবে না — duplicate ধরা পড়বে।',
      'প্রতিটা APK স্বয়ংক্রিয়ভাবে VirusTotal দিয়ে স্ক্যান হয়। Flagged হলে app approve হবে না।',
      'Icon: স্কয়ার ছবি। Screenshot: কমপক্ষে একটা।',
      'Age rating সঠিকভাবে বেছে নাও (3+/12+/18+) — ভুল rating দিলে app suspend হতে পারে।',
    ],
  },
  {
    title: 'Review প্রক্রিয়া',
    items: [
      'Submit করার পর app "পর্যালোচনাধীন" (pending) অবস্থায় থাকে।',
      'Admin ম্যানুয়ালি review করে Approve/Reject করে। Reject হলে কারণ dashboard-এ দেখাবে।',
      'Approve/Reject/Suspend হলে dashboard-এ notification পাবে (browser push notification চালু থাকলে)।',
    ],
  },
  {
    title: 'Version Update ও Rollback',
    items: [
      'নতুন version আপলোড করলেই সেটা স্বয়ংক্রিয়ভাবে "live" হয়ে যায় — নতুন করে review লাগে না।',
      'কোনো version-এ সমস্যা দেখা দিলে dashboard থেকে আগের version-কে আবার "Live" করে দিতে পারো, নতুন আপলোড ছাড়াই।',
    ],
  },
  {
    title: 'Rating, Review, ও Report',
    items: [
      'ব্যবহারকারীরা app-এ rating/review দিতে পারবে — এটা edit বা delete করার অধিকার শুধু তাদেরই।',
      'কেউ app report করলে admin দেখবে; বারবার report হলে app suspend হতে পারে।',
    ],
  },
]

export default function DeveloperGuide() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">Developer Guide</h1>
      <div className="flex flex-col gap-8">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="mb-2 font-medium">{section.title}</h2>
            <ul className="flex flex-col gap-1.5 text-sm text-ink/70">
              {section.items.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-ink/30">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
