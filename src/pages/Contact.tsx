export default function Contact() {
  return (
    <div className="mx-auto max-w-lg text-center">
      <h1 className="mb-2 text-xl font-semibold">যোগাযোগ করো</h1>
      <p className="mb-6 text-sm text-ink/60">
        App-সংক্রান্ত সমস্যা, developer account, বা payment নিয়ে প্রশ্ন থাকলে নিচের ঠিকানায় লেখো।
      </p>

      <div className="rounded-card border border-ink/10 bg-white p-6">
        <p className="mb-1 text-sm text-ink/50">ইমেইল</p>
        <a href="mailto:support@rkappstore.example" className="text-brand-600 underline">
          support@rkappstore.example
        </a>
        <p className="mt-4 text-xs text-ink/40">সাধারণত ২৪-৪৮ ঘণ্টার মধ্যে উত্তর দেওয়া হয়।</p>
      </div>

      <p className="mt-4 text-xs text-ink/40">
        (এই email ঠিকানাটা placeholder — নিজের আসল support email দিয়ে <code>src/pages/Contact.tsx</code>-এ বদলে নাও।)
      </p>
    </div>
  )
}
