// Service worker for ride sign-in.
//
// Its whole job is that a leader who reloads, backgrounds, or reopens the
// app in a dead spot still gets a working scanner. The attendance list and
// the member roster live in IndexedDB and are not this file's concern; what
// this handles is the shell those things are rendered by.
//
// Two deliberate limits:
//
//   Nothing is ever served from cache while the network is available. A
//   stale roster page showing yesterday's ride would be worse than a slow
//   one, and every page here is behind a login whose state can change.
//
//   Nothing under /api, /auth, or any non-GET request is cached at all. A
//   cached authentication response is a security bug, and a replayed POST
//   is a duplicated write.

const VERSION = 'vcdc-ride-v1'
const SHELL = `${VERSION}-shell`
const PAGES = `${VERSION}-pages`

const PRECACHE = [
  '/offline',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL && key !== PAGES)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

function isCacheableNavigation(url) {
  if (url.origin !== self.location.origin) return false
  if (url.pathname.startsWith('/api')) return false
  if (url.pathname.startsWith('/auth')) return false
  return url.pathname === '/ride' || url.pathname.startsWith('/ride/')
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Build output is content hashed, so it can be cached forever and served
  // from cache first without ever going stale.
  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            const copy = response.clone()
            caches.open(SHELL).then((cache) => cache.put(request, copy))
            return response
          })
      )
    )
    return
  }

  if (request.mode !== 'navigate') return
  if (!isCacheableNavigation(url)) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Never cache a redirect to the login page as if it were the ride
        // page: that is how a leader ends up with a permanently blank app.
        if (response.ok && response.type === 'basic') {
          const copy = response.clone()
          caches.open(PAGES).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        const offline = await caches.match('/offline')
        return (
          offline ??
          new Response('Offline', {
            status: 503,
            headers: { 'content-type': 'text/plain' },
          })
        )
      })
  )
})
