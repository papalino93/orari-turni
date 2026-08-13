// Service worker volutamente "vuoto": non mette nulla in cache e non
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
