import { useEffect, useState } from 'react'
import { fetchBudgetProjection, type BudgetProjection } from '@/services/admin'

export default function AdminBudget() {
  const [data, setData] = useState<BudgetProjection | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchBudgetProjection().then((d) => {
      setData(d)
      setLoading(false)
    })
  }, [])

  if (loading || !data) return <p className="text-sm text-ink/50">লোড হচ্ছে…</p>

  const nearFreeLimit = data.totalApkStorageGB > 7 && data.totalApkStorageGB <= data.r2FreeQuotaGB

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold">Infra Budget</h1>
      <p className="mb-6 text-sm text-ink/50">
        এখনকার আসল ব্যবহার থেকে হিসাব করা — store বাড়লে এই সংখ্যাগুলো নিজে থেকেই আপডেট হবে।
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="মোট App" value={data.totalApps} />
        <Stat label="মোট Developer" value={data.totalDevelopers} />
        <Stat label="APK Storage" value={`${data.totalApkStorageGB.toFixed(2)} GB`} />
      </div>

      <div className="mb-6 rounded-card border border-ink/10 bg-white p-5">
        <p className="mb-3 font-medium">Cloudflare R2 (APK Storage)</p>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <p className="text-2xl font-semibold">{data.totalApkStorageGB.toFixed(2)} GB</p>
            <p className="text-xs text-ink/50">এখন ব্যবহৃত (প্রথম {data.r2FreeQuotaGB} GB ফ্রি)</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-signal-green">
              ${data.estimatedR2MonthlyCostUsd.toFixed(2)}
              <span className="text-sm font-normal text-ink/50">/মাস</span>
            </p>
            <p className="text-xs text-ink/50">আনুমানিক খরচ</p>
          </div>
        </div>

        {nearFreeLimit && (
          <p className="rounded-card bg-signal-amber/10 p-2 text-xs text-signal-amber">
            ⚠️ ফ্রি tier-এর ({data.r2FreeQuotaGB} GB) কাছাকাছি চলে এসেছ — কয়েক মাসের মধ্যে সামান্য টাকা (প্রতি GB-তে
            ~$0.015/মাস) লাগা শুরু হতে পারে। এটা কোনো সমস্যা না — bill আসবে সামান্য, hard limit নেই।
          </p>
        )}

        <p className="mt-3 text-xs text-ink/40">
          এই হিসাবে rollback করা পুরনো version-গুলোর ফাইল ধরা নেই — সেগুলো R2-তে থেকেই যায় (rollback শুধু কোনটা
          serve হবে সেটা বদলায়, পুরনো ফাইল ডিলিট করে না), তাই আসল খরচ এই সংখ্যার চেয়ে সামান্য বেশি হতে পারে।
        </p>
      </div>

      <div className="rounded-card border border-ink/10 bg-ink/[0.02] p-5 text-sm text-ink/60">
        <p className="mb-2 font-medium text-ink">যা এখান থেকে হিসাব করা যায়নি</p>
        <ul className="flex flex-col gap-1">
          <li>
            • <strong>Supabase Database size</strong> — Supabase Dashboard → Project Settings → Database-এ সরাসরি
            দেখো
          </li>
          <li>
            • <strong>Supabase Storage</strong> (icon/screenshot) — Dashboard → Storage-এ দেখো; এগুলো ছোট ফাইল,
            সাধারণত উদ্বেগের কারণ হয় না
          </li>
          <li>• <strong>SSLCommerz-এর transaction fee</strong> — এটা per-transaction %, infra খরচ না</li>
        </ul>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-card border border-ink/10 bg-white p-3">
      <p className="text-2xl font-semibold">{typeof value === 'number' ? value.toLocaleString('bn-BD') : value}</p>
      <p className="text-xs text-ink/50">{label}</p>
    </div>
  )
}
