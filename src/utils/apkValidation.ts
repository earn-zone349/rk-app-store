/**
 * Phase 6, steps 41 & 46: real file-type validation and upload limits.
 *
 * storage.ts already rejects files whose *name* doesn't end in .apk and
 * anything over 200MB — but a filename is just a string; renaming
 * `virus.exe` to `app.apk` defeats that instantly. This module checks the
 * actual file *content* instead, which is what step 41 ("APK validation")
 * really means.
 *
 * An .apk file is a zip archive (specifically a JAR, which is itself a
 * zip), so a genuine APK always starts with a zip local-file-header
 * signature. This is the same check `file`/`unzip` use on the command
 * line — cheap (reads 4 bytes), can't be faked by a file extension, and
 * runs entirely in the browser before anything is uploaded.
 */

// Zip local file header signature: 'PK\x03\x04' (little-endian 0x04034b50).
// A handful of other PK-prefixed signatures exist for edge cases (empty
// archives, spanned archives) — included so a technically-valid-but-empty
// zip isn't wrongly rejected.
const ZIP_SIGNATURES = [
  [0x50, 0x4b, 0x03, 0x04], // normal — at least one entry
  [0x50, 0x4b, 0x05, 0x06], // empty archive
  [0x50, 0x4b, 0x07, 0x08], // spanned archive, first segment
]

export interface ApkFileCheckResult {
  ok: boolean
  reason?: string
}

/** Reads only the first 4 bytes of the file — no need to load the whole APK into memory for this. */
async function readMagicBytes(file: File): Promise<number[]> {
  const buffer = await file.slice(0, 4).arrayBuffer()
  return Array.from(new Uint8Array(buffer))
}

function matchesAnySignature(bytes: number[]): boolean {
  return ZIP_SIGNATURES.some((sig) => sig.every((b, i) => bytes[i] === b))
}

/**
 * Content-level checks that don't require a network round-trip. Call this
 * before uploadApk() so an obviously-invalid file never reaches storage at
 * all.
 */
export async function validateApkFile(file: File): Promise<ApkFileCheckResult> {
  if (!file.name.toLowerCase().endsWith('.apk')) {
    return { ok: false, reason: 'শুধু .apk ফাইল আপলোড করা যাবে।' }
  }

  const MAX_SIZE = 200 * 1024 * 1024 // matches storage.ts — kept here too so
  // this function can be used as a single validation entry point.
  if (file.size > MAX_SIZE) {
    return { ok: false, reason: 'APK ফাইল ২০০ MB-এর বেশি হতে পারবে না।' }
  }

  if (file.size < 4) {
    return { ok: false, reason: 'ফাইলটা খুবই ছোট — এটা আসলে একটা APK বলে মনে হচ্ছে না।' }
  }

  const magic = await readMagicBytes(file)
  if (!matchesAnySignature(magic)) {
    return {
      ok: false,
      reason:
        'এই ফাইলটা আসলে একটা valid APK (zip) না — extension .apk হলেও ফাইলের ভেতরের কনটেন্ট মেলেনি। ভুল ফাইল সিলেক্ট হয়ে থাকতে পারে।',
    }
  }

  return { ok: true }
}
