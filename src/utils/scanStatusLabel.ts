import type { AppVersion } from '@/types'

/**
 * Both DeveloperDashboard.tsx (Phase 6) and AdminAppReview.tsx (Phase 7)
 * need to show a VirusTotal security_status as a small colored badge —
 * this was originally written twice and drifted into two almost-but-not-
 * quite-identical copies, which is exactly the kind of thing that quietly
 * becomes two different badges after the next edit touches only one of
 * them. One definition, both places import it.
 */
export const SCAN_STATUS_LABEL: Record<AppVersion['securityStatus'], { text: string; className: string }> = {
  pending: { text: 'Scan শুরু হয়নি', className: 'bg-ink/10 text-ink/50' },
  scanning: { text: '🔄 Scan চলছে…', className: 'bg-brand-100 text-brand-700' },
  clean: { text: '🛡️ নিরাপদ', className: 'bg-signal-green/15 text-signal-green' },
  flagged: { text: '⚠️ ফ্ল্যাগ হয়েছে', className: 'bg-signal-red/15 text-signal-red' },
  error: { text: 'Scan ব্যর্থ হয়েছে', className: 'bg-signal-amber/15 text-signal-amber' },
}
