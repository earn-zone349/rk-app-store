/**
 * Phase 6, step 49: show extracted APK permissions to users before they
 * download, translated into plain Bangla and flagged by sensitivity —
 * exactly what Play Store's old permissions screen used to do.
 *
 * The raw permission strings (e.g. "android.permission.CAMERA") come from
 * apkParser.ts, stored on app_versions.permissions. This module is just
 * the display layer: a lookup table for the common ones, with a sane
 * fallback for anything not in the table (custom/rare permissions still
 * show up, just without a friendly translation).
 */

interface PermissionInfo {
  label: string
  sensitive: boolean
}

const KNOWN_PERMISSIONS: Record<string, PermissionInfo> = {
  'android.permission.CAMERA': { label: 'ক্যামেরা ব্যবহার করতে পারবে', sensitive: true },
  'android.permission.RECORD_AUDIO': { label: 'মাইক্রোফোন ব্যবহার করতে পারবে', sensitive: true },
  'android.permission.ACCESS_FINE_LOCATION': { label: 'সঠিক লোকেশন জানতে পারবে', sensitive: true },
  'android.permission.ACCESS_COARSE_LOCATION': { label: 'আনুমানিক লোকেশন জানতে পারবে', sensitive: true },
  'android.permission.READ_CONTACTS': { label: 'কন্টাক্ট লিস্ট পড়তে পারবে', sensitive: true },
  'android.permission.WRITE_CONTACTS': { label: 'কন্টাক্ট লিস্ট বদলাতে পারবে', sensitive: true },
  'android.permission.READ_SMS': { label: 'SMS পড়তে পারবে', sensitive: true },
  'android.permission.SEND_SMS': { label: 'SMS পাঠাতে পারবে', sensitive: true },
  'android.permission.READ_CALL_LOG': { label: 'কল হিস্ট্রি পড়তে পারবে', sensitive: true },
  'android.permission.READ_PHONE_STATE': { label: 'ফোনের তথ্য (নম্বর, স্ট্যাটাস) দেখতে পারবে', sensitive: true },
  'android.permission.READ_EXTERNAL_STORAGE': { label: 'ফোনের ফাইল পড়তে পারবে', sensitive: false },
  'android.permission.WRITE_EXTERNAL_STORAGE': { label: 'ফোনে ফাইল সেভ/এডিট করতে পারবে', sensitive: false },
  'android.permission.INTERNET': { label: 'ইন্টারনেট ব্যবহার করবে', sensitive: false },
  'android.permission.ACCESS_NETWORK_STATE': { label: 'নেটওয়ার্ক কানেকশন আছে কিনা দেখতে পারবে', sensitive: false },
  'android.permission.BLUETOOTH': { label: 'ব্লুটুথ ব্যবহার করতে পারবে', sensitive: false },
  'android.permission.VIBRATE': { label: 'ফোন ভাইব্রেট করাতে পারবে', sensitive: false },
  'android.permission.POST_NOTIFICATIONS': { label: 'নোটিফিকেশন পাঠাতে পারবে', sensitive: false },
  'android.permission.WAKE_LOCK': { label: 'ফোন ঘুমাতে না দিয়ে জাগিয়ে রাখতে পারবে', sensitive: false },
}

function describe(permission: string): PermissionInfo {
  return KNOWN_PERMISSIONS[permission] ?? { label: permission, sensitive: false }
}

export default function PermissionsList({ permissions }: { permissions: string[] }) {
  if (permissions.length === 0) {
    return <p className="text-sm text-ink/50">এই app-এর জন্য কোনো বিশেষ permission দরকার হয় না।</p>
  }

  const sorted = [...permissions].sort((a, b) => Number(describe(b).sensitive) - Number(describe(a).sensitive))

  return (
    <ul className="flex flex-col gap-1.5">
      {sorted.map((permission) => {
        const info = describe(permission)
        return (
          <li key={permission} className="flex items-start gap-2 text-sm">
            <span className={info.sensitive ? 'text-signal-amber' : 'text-ink/40'} aria-hidden>
              {info.sensitive ? '⚠️' : '•'}
            </span>
            <span className={info.sensitive ? 'text-ink' : 'text-ink/60'}>{info.label}</span>
          </li>
        )
      })}
    </ul>
  )
}
