/**
 * Computes the SHA-256 hash of a File entirely in the browser, using the
 * Web Crypto API (no extra library). Used when a developer uploads an APK,
 * so every app_versions row has a verifiable hash from day one — Phase 6
 * (duplicate detection, tamper checks) will read this same column.
 */
export async function sha256File(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const bytes = Array.from(new Uint8Array(hashBuffer))
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('')
}
