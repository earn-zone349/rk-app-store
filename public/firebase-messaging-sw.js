// Firebase Cloud Messaging background handler.
//
// This file CANNOT read Vite's import.meta.env — service workers are
// fetched and run by the browser directly, outside the Vite build
// pipeline, so the config below has to be filled in by hand. See
// FCM_SETUP.md, step 4 for exactly where each value comes from (it's the
// same object as VITE_FIREBASE_* in .env, just written as plain JS here
// instead of environment variables).
//
// Uses the "compat" Firebase SDK build (firebase-messaging-compat.js) via
// importScripts — the modular SDK used in src/lib/firebase.ts isn't
// import-able this way inside a classic service worker without a bundler
// step, and compat is what Firebase's own docs use for exactly this file.

importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'তোমার-firebase-api-key',
  authDomain: 'তোমার-project.firebaseapp.com',
  projectId: 'তোমার-project-id',
  storageBucket: 'তোমার-project.appspot.com',
  messagingSenderId: 'তোমার-sender-id',
  appId: 'তোমার-app-id',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? 'RK App Store'
  const options = {
    body: payload.notification?.body ?? '',
    icon: '/icons/placeholder-app.svg',
  }
  self.registration.showNotification(title, options)
})
