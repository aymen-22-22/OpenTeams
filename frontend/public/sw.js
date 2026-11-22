// Service worker: shows push notifications and opens the right page when one is clicked.
// No offline caching on purpose: the app always talks to the server.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const link = typeof data.link === 'string' && data.link.startsWith('/') ? data.link : '/'
  event.waitUntil(
    self.registration.showNotification(data.title || 'OpenTeams', {
      body: data.body || '',
      tag: data.tag || link, // a newer alert for the same conversation replaces the older one
      renotify: true,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { link },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.link || '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (open) {
        await open.focus()
        return open.navigate(url) // the app opens deep links (/tasks/…, /conversations/…)
      }
      return self.clients.openWindow(url)
    })(),
  )
})
