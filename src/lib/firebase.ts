import { initializeApp, getApps } from 'firebase/app'
import { getMessaging, getToken, isSupported, type Messaging } from 'firebase/messaging'

/**
 * All of these are PUBLIC identifiers, not secrets — this is the same
 * config Google's own docs say is fine to ship in a client bundle (it
 * identifies which Firebase project to talk to; it doesn't authorize
 * anything on its own). The actual secret (the service account private
 * key used to *send* notifications) lives only in the admin-action Edge
 * Function's environment — see supabase/functions/_shared/fcm.ts.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined

function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && vapidKey)
}

let messagingInstance: Messaging | null = null

async function getMessagingInstance(): Promise<Messaging | null> {
  if (!isFirebaseConfigured()) return null
  if (!(await isSupported())) return null // Safari/older browsers, or a non-HTTPS dev context

  if (!messagingInstance) {
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
    messagingInstance = getMessaging(app)
  }
  return messagingInstance
}

/**
 * Asks the browser for notification permission (if not already
 * granted/denied) and, if granted, returns the device-specific FCM
 * registration token to save server-side. Returns null for every "can't
 * do this right now" case (unsupported browser, permission denied,
 * Firebase not configured) rather than throwing — calling code treats
 * push notifications as an optional enhancement, never something that
 * should block or error out the rest of the page.
 */
export async function requestFcmToken(): Promise<string | null> {
  const messaging = await getMessagingInstance()
  if (!messaging) return null

  if (Notification.permission === 'denied') return null
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
  try {
    return await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration })
  } catch (err) {
    console.error('FCM getToken failed:', err)
    return null
  }
}
