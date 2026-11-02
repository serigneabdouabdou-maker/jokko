// Ancienne adresse de Jokko : ce service worker se retire tout seul et renvoie vers jokkoapp.com.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: "window" })) client.navigate("https://jokkoapp.com/");
  })());
});
