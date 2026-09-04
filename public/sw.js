// Minimal service worker: makes the app installable. Deliberately NETWORK-ONLY —
// nothing is cached, so financial figures are never served stale from a cache.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  /* pass through to the network */
});
