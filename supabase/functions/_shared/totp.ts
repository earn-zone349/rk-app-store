// Shared by admin-verify-totp and admin-enroll. Not deployed on its own —
// Supabase bundles anything under supabase/functions/_shared/ into whatever
// function imports it.
//
// Implements RFC 6238 (TOTP) directly on top of the Web Crypto API
// (available natively in Deno, same `crypto.subtle` as the browser) rather
// than pulling in an npm/otplib dependency — the algorithm is ~40 lines and
// keeping it dependency-free means one less supply-chain surface for
// something that gates admin access.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP_SECONDS = 30
const DIGITS = 6

/** Decodes an RFC 4648 base32 string (no padding) into raw bytes. */
function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '')
  const bytes: number[] = []
  let bitBuffer = 0
  let bitCount = 0

  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char)
    if (value === -1) continue
    bitBuffer = (bitBuffer << 5) | value
    bitCount += 5
    if (bitCount >= 8) {
      bitCount -= 8
      bytes.push((bitBuffer >> bitCount) & 0xff)
    }
  }
  return new Uint8Array(bytes)
}

/** 8-byte big-endian representation of a TOTP time-counter (RFC 6238 uses the same 8-byte counter format as HOTP, RFC 4226). */
function counterToBytes(counter: number): Uint8Array {
  const bytes = new Uint8Array(8)
  let value = counter
  for (let i = 7; i >= 0; i--) {
    bytes[i] = value & 0xff
    value = Math.floor(value / 256)
  }
  return bytes
}

async function hmacSha1(keyBytes: Uint8Array, messageBytes: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, messageBytes)
  return new Uint8Array(signature)
}

/** Computes the 6-digit TOTP code for a given base32 secret at a given unix-counter (defaults to "now"). */
export async function generateTotpCode(base32Secret: string, counter?: number): Promise<string> {
  const timeCounter = counter ?? Math.floor(Date.now() / 1000 / STEP_SECONDS)
  const keyBytes = base32Decode(base32Secret)
  const hash = await hmacSha1(keyBytes, counterToBytes(timeCounter))

  // Dynamic truncation (RFC 4226 §5.3): use the low nibble of the last
  // byte as an offset into the HMAC output, then take 4 bytes from there
  // and drop the top bit (keeps the result positive as a signed int32).
  const offset = hash[hash.length - 1] & 0x0f
  const binary =
    ((hash[offset] & 0x7f) << 24) | ((hash[offset + 1] & 0xff) << 16) | ((hash[offset + 2] & 0xff) << 8) | (hash[offset + 3] & 0xff)

  const code = binary % 10 ** DIGITS
  return code.toString().padStart(DIGITS, '0')
}

/**
 * Verifies a user-entered code against the secret, allowing ±1 time step
 * (±30s) either side of "now" — without this, a code typed just as a
 * 30-second window rolls over would be rejected even though it was valid
 * a second ago, which is a common and frustrating false negative in real
 * TOTP implementations that only check the exact current window.
 */
export async function verifyTotpCode(base32Secret: string, code: string): Promise<boolean> {
  const normalized = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(normalized)) return false

  const currentCounter = Math.floor(Date.now() / 1000 / STEP_SECONDS)
  for (const drift of [0, -1, 1]) {
    const candidate = await generateTotpCode(base32Secret, currentCounter + drift)
    if (candidate === normalized) return true
  }
  return false
}
