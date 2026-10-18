const SECTIONS = [
  { title: '১. সেবার বর্ণনা', body: 'RK App Store একটি Android APK distribution platform — এখানে developer-রা app publish করে, ব্যবহারকারীরা সেগুলো ডাউনলোড করে।' },
  { title: '২. অ্যাকাউন্ট', body: 'একটা account একজনের ব্যক্তিগত ব্যবহারের জন্য। Password অন্য কাউকে দেওয়া যাবে না। Account-এর মাধ্যমে যা কিছু ঘটে তার দায়ভার account-holder-এর।' },
  { title: '৩. Downloaded App ব্যবহারের ঝুঁকি', body: 'প্রতিটা APK VirusTotal দিয়ে স্ক্যান করা হয়, কিন্তু কোনো স্ক্যানই ১০০% নিশ্চয়তা দেয় না। একটা app ডাউনলোড ও ইনস্টল করার সিদ্ধান্ত এবং তার ফলাফল সম্পূর্ণভাবে ব্যবহারকারীর নিজের দায়িত্ব।' },
  { title: '৪. নিষিদ্ধ কার্যকলাপ', body: 'Malware, cracked/pirated app, কপিরাইট লঙ্ঘনকারী কনটেন্ট, বা প্রতারণামূলক কোনো app upload করা নিষিদ্ধ। এমন app পাওয়া গেলে সাথে সাথে suspend/reject করা হবে, এবং প্রয়োজনে account স্থায়ীভাবে বন্ধ করা হতে পারে।' },
  { title: '৫. সেবা পরিবর্তন', body: 'আমরা যেকোনো সময় এই platform-এর feature যোগ, পরিবর্তন, বা বন্ধ করার অধিকার রাখি, যুক্তিসঙ্গত পূর্ব-নোটিশ দিয়ে।' },
  { title: '৬. দায়বদ্ধতার সীমা', body: 'এই সেবা "যেমন আছে" ভিত্তিতে দেওয়া হয়। কোনো app-এর মাধ্যমে সৃষ্ট ক্ষতির জন্য RK App Store দায়ী থাকবে না — সেই দায়িত্ব সংশ্লিষ্ট app developer-এর।' },
]

export default function TermsOfService() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-xl font-semibold">Terms of Service</h1>
      <p className="mb-6 rounded-card border border-signal-amber/30 bg-signal-amber/10 p-3 text-xs text-signal-amber">
        এটি একটি শুরুর টেমপ্লেট — আইনজীবীর মাধ্যমে review করিয়ে নেওয়ার পরামর্শ দেওয়া হচ্ছে, বিশেষ করে দায়বদ্ধতা ও বিরোধ-নিষ্পত্তি সংক্রান্ত ধারাগুলো নিয়ে।
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
