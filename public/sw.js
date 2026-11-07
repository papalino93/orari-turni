// Service worker volutamente "vuoto" (salvo gli avvisi qui in fondo): non mette nulla in cache e non
// intercetta le richieste (tutto continua a funzionare online esattamente
// come prima). Esiste solo perché la sua presenza è uno dei requisiti che
// Chrome su Android controlla prima di offrire "Installa app" — senza,
// l'icona sulla schermata Home resta comunque possibile a mano, ma il
// suggerimento automatico del browser non compare.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Avvisi delle prenotazioni (Web Push, vedi lib/booking/push.ts): mostra la notifica e, al
// tocco, apre la pagina indicata (o porta in primo piano l'app già aperta). Niente cache.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "L'Angolo del Vino";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/prenotazioni" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let url = new URL("/prenotazioni", self.location.origin).href;
  try {
    const wanted = new URL((event.notification.data && event.notification.data.url) || "/prenotazioni", self.location.origin);
    // Solo pagine di questo sito.
    if (wanted.origin === self.location.origin) url = wanted.href;
  } catch {
    /* indirizzo strano: si apre /prenotazioni */
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const same = windows.find((c) => c.url === url);
      if (same) return same.focus();
      // Si riusa solo una finestra già sulle prenotazioni: spostarne un'altra (es. la gestione del
      // menù con modifiche non salvate) farebbe perdere il lavoro.
      const ours = windows.find((c) => new URL(c.url).origin === self.location.origin && new URL(c.url).pathname.startsWith("/prenotazioni"));
      if (ours) {
        try {
          await ours.focus();
          return await ours.navigate(url);
        } catch {
          /* non controllata da questo service worker: si apre una finestra nuova */
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
