// Jokko — service worker : l'appli s'ouvre même sans internet, et peut afficher des notifications.
// Les données de la boutique ne passent jamais par ce cache : seulement les fichiers de l'appli.
const VERSION = "jokko-v2";
const SHELL = ["./", "manifest.webmanifest", "icon-192.png", "icon-512.png", "jokko-mark.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Page de l'appli : internet d'abord (dernière version), sinon la copie gardée. */
async function page(request) {
  const cache = await caches.open(VERSION);
  try {
    const fresh = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("lent")), 5000)),
    ]);
    if (fresh.ok) cache.put("./", fresh.clone());
    return fresh;
  } catch {
    return (await cache.match("./")) ?? Response.error();
  }
}

/** Fichiers de l'appli (leur nom change à chaque version) : la copie gardée d'abord. */
async function asset(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const fresh = await fetch(request);
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Seulement les fichiers de l'appli elle-même ; Supabase, Gemini, polices : jamais mis en cache ici.
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  if (request.mode === "navigate") event.respondWith(page(request));
  else event.respondWith(asset(request));
});

// Notifications envoyées par le serveur (alertes du patron, prochaines étapes).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Jokko", {
      body: data.body || "",
      icon: "icon-192.png",
      badge: "icon-192.png",
      tag: data.tag,
      data: { url: data.url || "./" },
    }),
  );
});

// Toucher une notification ouvre Jokko (ou revient dessus s'il est déjà ouvert).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          if ("navigate" in client && event.notification.data?.url) void client.navigate(target).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
