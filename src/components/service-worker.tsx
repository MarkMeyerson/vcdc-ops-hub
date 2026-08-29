'use client'

import { useEffect } from 'react'

// Registers the ride sign-in service worker.
//
// Mounted only inside the ride app, not at the root: the admin pages have no
// offline story and do not want a cache layer between them and the database.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // Registration failing is not worth telling anyone about: the app works
    // without it, it just will not survive a reload in a dead spot.
    void navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])
  return null
}
