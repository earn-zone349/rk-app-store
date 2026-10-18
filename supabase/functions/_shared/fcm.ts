// Shared by any Edge Function that needs to push an FCM notification —
// currently just admin-action, for step 69 (approve/reject/suspend
// alerts). Talks to Firebase Cloud Messaging's HTTP v1 API directly via
// fetch + Web Crypto, rather than the firebase-admin npm package — that
// package pulls in a large chunk of the Node/gRPC ecosystem for something
// this is ~80 lines of straightforward OAuth2 without it, and Deno's
// crypto.subtle already does everything the signing step needs.
//
// Secrets required (see FCM_SETUP.md for how to get these from the
// Firebase console):
//   FCM_PROJECT_ID       — Firebase project id
//   FCM_CLIENT_EMAIL     — service account email
//   FCM_PRIVATE_KEY      — service account private key, PEM format,
//                           exactly as it appears in the downloaded JSON
//                           (including the literal \n line breaks — Deno's
//                           `Deno.env.get` returns it as one string, this
//                           module un-escapes it below)

interface FcmServiceAccountEnv {
  projectId: string
  clientEmail: string
  privateKey: string
}

function readServiceAccountEnv(): FcmServiceAccountEnv | null {
  const projectId = Deno.env.get('FCM_PROJECT_ID')
  const clientEmail = Deno.env.get('FCM_CLIENT_EMAIL')
  const rawKey = Deno.env.get('FCM_PRIVATE_KEY')
  if (!projectId || !clientEmail || !rawKey) return null
  return { projectId, clientEmail, privateKey: rawKey.replace(/\\n/g, '\n') }
}

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (const b of arr) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const stripped = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')
  const binary = atob(stripped)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/**
 * Standard Google service-account OAuth2 flow (RFC 7523, JWT bearer
 * grant): sign a short-lived JWT with the service account's private key,
 * exchange it for an access token. Not cached across invocations —
 * approve/reject/suspend actions are infrequent enough (an admin doing a
 * handful a day, not thousands) that fetching a fresh token each time is
 * simpler and not worth the added complexity of a token cache.
 */
async function getAccessToken(account: FcmServiceAccountEnv): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const claims = {
    iss: account.clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const encodedHeader = base64url(new TextEncoder().encode(JSON.stringify(header)))
  const encodedClaims = base64url(new TextEncoder().encode(JSON.stringify(claims)))
  const signingInput = `${encodedHeader}.${encodedClaims}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(account.privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput))
  const jwt = `${signingInput}.${base64url(signature)}`

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!tokenResponse.ok) {
    throw new Error(`FCM OAuth2 token exchange failed: ${tokenResponse.status} ${await tokenResponse.text()}`)
  }
  const tokenData = await tokenResponse.json()
  return tokenData.access_token as string
}

/**
 * Sends a push notification to every device the given app user has
 * registered a token for (fcm_tokens table, 0011_phase_gaps.sql). Silently
 * does nothing (not an error) if FCM isn't configured yet or the user has
 * no registered devices — a store owner who hasn't set up Firebase yet
 * shouldn't have approve/reject start failing because of it.
 */
export async function sendFcmToUser(
  // deno-lint-ignore no-explicit-any -- supabase-js client type, kept loose to avoid importing the full type here
  serviceClient: any,
  userId: string,
  title: string,
  body: string,
): Promise<void> {
  const account = readServiceAccountEnv()
  if (!account) {
    console.log('FCM not configured (FCM_PROJECT_ID/FCM_CLIENT_EMAIL/FCM_PRIVATE_KEY secrets missing) — skipping push notification.')
    return
  }

  const { data: tokens } = await serviceClient.from('fcm_tokens').select('id, token').eq('user_id', userId)
  if (!tokens || tokens.length === 0) return

  const accessToken = await getAccessToken(account)
  const staleTokenIds: string[] = []

  await Promise.all(
    tokens.map(async (row: { id: string; token: string }) => {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${account.projectId}/messages:send`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: { token: row.token, notification: { title, body } } }),
        },
      )
      if (!response.ok) {
        const errorBody = await response.text()
        // UNREGISTERED / INVALID_ARGUMENT means the token is dead (app
        // uninstalled, browser permission revoked, etc.) — clean it up so
        // future sends don't keep wasting a request on it.
        if (errorBody.includes('UNREGISTERED') || errorBody.includes('INVALID_ARGUMENT')) {
          staleTokenIds.push(row.id)
        } else {
          console.error('FCM send failed for one token:', response.status, errorBody)
        }
      }
    }),
  )

  if (staleTokenIds.length > 0) {
    await serviceClient.from('fcm_tokens').delete().in('id', staleTokenIds)
  }
}
