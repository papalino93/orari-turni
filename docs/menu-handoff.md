# Menù pubblico via QR: passaggio di consegne

Documento per riprendere il lavoro da un'altra sessione. Scritto per chi non ha visto la conversazione. Aggiornalo a ogni passo concluso.

Il titolare (L'Angolo del Vino, enoteca a Scandicci) parla italiano: risposte brevi, in italiano, senza gergo. Ha autorizzato a procedere in autonomia (commit, PR, merge e deploy) per questo lavoro, e ha chiesto: **alla fine di tutto, sempre un giro approfondito di bug e UX** (mobile, tablet, PC).

## Cosa è già in produzione

PR #30 e #31 sono unite su `main` e deployate.

- **`/menu`** (pubblico, senza login, non indicizzato): copertina, barra sezioni, 7 sezioni e 71 voci, vini esauriti nascosti, piatti esauriti sbiaditi, coperto unico mostrato in tutte le sezioni di cucina, link a `/menu/allergeni`. Cache con `revalidate = 60` più `revalidateMenu()` a ogni modifica.
- **`/menu/allergeni`** (pubblico): 14 allergeni UE, filtro "devi evitare qualcosa?", nota solfiti per i vini, piatti non compilati = "Da verificare con il personale".
- **`/gestione-menu`** (login + permesso): voci (aggiungi, modifica, duplica, elimina, sposta, "Esaurito", "Riattiva tutto"), gruppi, testi di sezione, coperto unico, allergeni per piatto, "Incolla più voci" con anteprima, storico con annulla e ripristina.
- **Permessi**: titolare e consulente sempre; un dipendente solo con l'interruttore "Può modificare il menù" in Dipendenti (`Employee.canEditMenu`, letto dal database a ogni richiesta). Ogni Server Action chiama `requireMenuEditor()` (`src/lib/guard.ts`).
- **Proxy** (`src/proxy.ts`): apre al pubblico solo `menu(?:/|$)`. L'elenco esclude per prefisso: l'area di gestione sta sotto `/gestione-menu` apposta.
- Il link del QR stampato (qrco.de/bes4Ad, QR Code Generator) **non va toccato**: lo ripunta il titolare quando vuole.

### Mappa dei file
- Pubblico: `src/app/(public)/menu/` (`page.tsx`, `menu-nav.tsx`, `menu.css`, `ornament.tsx`, `allergeni/`). Assets in `public/menu/` (`hero.jpg`, `logo.png`).
- Gestione: `src/app/(app)/gestione-menu/` (`actions.ts`, `menu-editor.tsx`, `item-sheet.tsx`, `import-sheet.tsx`, `side-sheets.tsx`, `sheet.tsx`, `page.tsx`).
- Logica: `src/lib/menu.ts` (solo server: database, `revalidateMenu`), `src/lib/menu-format.ts` (pura, usabile nel client: prezzi, giorno commerciale, `nb`), `src/lib/menu-import.ts`, `src/lib/allergens.ts`.
- Dati: modelli `MenuSection`, `MenuGroup`, `MenuItem`, `MenuChange` (storico), `MenuSetting` (coperto) in `prisma/schema.prisma`. Le migrazioni si applicano al deploy (`npm run build` = `prisma migrate deploy && next build`).
- Il giorno commerciale cambia alle 5:00 ora italiana (`businessDayKey`). "Esaurito" = `soldOutDay` uguale al giorno corrente: si azzera da solo, nessun cron.

## Da fare, in quest'ordine (piano completo: vedi sotto)

### Passo 1: eventi e annunci (urgente: Oktoberfest la settimana dopo il 2 ottobre 2026)
Decisioni del titolare:
- Due tipi: **annuncio** (titolo, testo, foto, date) ed **evento con menù speciale** (come l'annuncio, più gruppi e voci dedicati).
- Sotto la copertina una striscia **«In evidenza»** di schede scorrevoli (locandina piccola, titolo, date); toccando si apre la pagina completa su un indirizzo proprio e condivisibile `/menu/p/<slug>` con «← Torna al menù».
- Date: locandina visibile da `showFrom` a `endDate`; menù speciale solo da `startDate` a `endDate`; poi sparisce da solo e resta in archivio; interruttore «Nascondi»; «Duplica» per riusarlo.
- Le voci di un evento possono avere più **formati con prezzo** (birra 0,2 l · 0,4 l · Maß 1 l).
- Tutto configurabile dalla gestione, anche da telefono, con gli stessi permessi.

Progetto tecnico scelto (schema da aggiungere a `prisma/schema.prisma` + migrazione):
```prisma
enum MenuPromoKind { NOTICE EVENT }
model MenuPromo {
  id String @id @default(cuid()); kind MenuPromoKind; slug String @unique
  title String; body String?
  showFrom String; startDate String; endDate String   // giorni commerciali YYYY-MM-DD
  hidden Boolean @default(false)
  imageUpdatedAt DateTime?; imageWidth Int?; imageHeight Int?
  deletedAt DateTime?; createdAt DateTime @default(now()); updatedAt DateTime @updatedAt
  image MenuPromoImage?; section MenuSection?
}
model MenuPromoImage { promoId String @id; promo MenuPromo @relation(fields:[promoId], references:[id], onDelete: Cascade); data Bytes; mimeType String; updatedAt DateTime @updatedAt }
// MenuSection: + promoId String? @unique, promo MenuPromo? (relation, onDelete: Cascade)   -> il menù speciale è una MenuSection collegata
// MenuItem: + variants Json?   // [{ "label": "0,4 l", "cents": 600 }], alternativo a priceCents
```
- Il menù speciale riusa gruppi, voci, esaurito, allergeni e incolla in blocco già esistenti: la sezione dell'evento (`promoId` valorizzato) NON va tra le sezioni fisse di `/menu`; si mostra nella pagina dell'evento solo mentre è attivo. Nella pagina allergeni compare mentre l'evento è attivo.
- Titolo dell'evento = `MenuPromo.title` (ignorare title/label della sezione collegata, per non doverli sincronizzare).
- Editor: stessa pagina `/gestione-menu`; sotto le sezioni fisse un blocco «Eventi e annunci» con elenco (stato: in corso, annunciato, concluso, nascosto), «+ Nuovo», scheda dell'evento (modifica, duplica, nascondi, elimina) e, per gli eventi, l'editor dei gruppi riusato. Foto: scelta dal telefono, ridimensionata sul dispositivo (max 1200×1600, JPEG, tentativi a qualità decrescente sotto ~800 KB), salvata nel database; rotta pubblica `/menu/p/<slug>/immagine` con cache lunga e `?v=`.
- Annulla: nuova entità `promo` nello storico (`RESTORABLE.promo = title, body, showFrom, startDate, endDate, hidden, deletedAt`), come già per item, group, section e setting in `actions.ts`.
- Aggiornare `revalidateMenu()` per includere `/menu/p/[slug]`.
- Prezzi: `variants` e `priceCents` si escludono; con formati il prezzo singolo non è richiesto.

### Passo 2: copertina, orari, contatti
- Copertina più bassa (circa metà schermo); foto e righe del titolo modificabili dalla gestione.
- Orari per giorno (anche spezzati) + eccezioni per data (aperture/chiusure straordinarie) + indicazione automatica «Aperto ora · chiude alle 22:00» / «Chiuso · riapre domani alle 16:30»; non compare se mancano gli orari. Dalla scheda Google: lun e mar 17–21:30; mer, ven, sab 10–13 e 16:30–22; gio 10–13 e 16:30–22:30; dom 16:30–21.
- Contatti in un solo posto, modificabili: telefono 338 327 7053, indirizzo Via dei Rossi 53C, 50018 Scandicci FI, Instagram `https://www.instagram.com/langolo.del.vino_enoteca/`, link recensione Google (**da chiedere al titolare**). Pulsanti: Chiama, WhatsApp (messaggio precompilato per prenotare), Come arrivare (Google Maps), Lascia una recensione, Instagram; un pulsante senza dato non compare.

### Passo 3: piatti e vini del giorno
Sezione «Oggi fuori menù» in cima, che si azzera alle 5:00; «Riproponi» ripresenta quelli di ieri.

### Passo 4: strumenti per i clienti (nella barra sezioni, discreti)
Ricerca (nome, zona, uvaggio, ingredienti), filtri «Al calice» ed «Enomatic», «Torna su», «A+» per il testo grande (ricordato nel dispositivo).

### Passo 5: comodità per chi gestisce
Ricerca di una voce con interruttore Esaurito, anteprima in cornice da telefono (affiancata sul PC), **modalità servizio** (solo Esaurito, interruttori grandi), riquadro «Da fare» (allergeni da compilare, esauriti da ieri, eventi in scadenza, orari straordinari mancanti).

### Generatore del QR code (quando serve)
Pagina in gestione con download SVG e PNG verso `/menu` (libreria `qrcode`). Non cambia il QR attuale.

### In chiusura, sempre
Giro approfondito di bug e UX su telefono, tablet e PC, per entrambe le parti (menù dei clienti e gestione); correggere ciò che si trova, poi riassumere al titolare.

## Domande aperte per il titolare
- Oktoberfest: date, birre con formati e prezzi, piatti (inseribili dalla gestione a rilascio fatto).
- Link «Scrivi una recensione» di Google; testo del messaggio WhatsApp.
- «La cucina chiude 40–50 minuti prima» compare solo in Taglieri & Pinse: mostrarlo anche in Tartare, come il coperto?
- Kombucha Zenzero e Bergamotto: allergeni da confermare sull'etichetta (oggi «da verificare»).
- Validare il testo informativo della pagina allergeni.

Regole già decise per gli allergeni: nel dubbio, in più. Il primo elenco è nella migrazione `20261002140000_menu_allergens_initial`.

## Come lavorare

### Git
- Branch di sviluppo: `claude/come-siamo-messi-vwh9qc`. Le PR sono unite con **squash**, quindi il branch remoto resta con vecchi commit già entrati in `main`: riparti da `git fetch origin main && git checkout -B claude/come-siamo-messi-vwh9qc origin/main` e, per pubblicare, `git push -u --force-with-lease=claude/come-siamo-messi-vwh9qc:<sha-remoto-atteso> origin claude/come-siamo-messi-vwh9qc` (solo se il remoto contiene già soltanto storia unita).
- Ogni commit termina con le due righe `Co-Authored-By: …` e `Claude-Session: …` indicate dall'ambiente; ogni descrizione di PR termina con `🤖 Generated with [Claude Code](https://claude.com/claude-code)` e l'URL della sessione.
- Le PR si creano e si uniscono con gli strumenti GitHub MCP (non c'è `gh`). Dopo il merge, controlla lo stato del commit (API `commits/<sha>/status` finché `success`) e poi `https://orari-turni.vercel.app/login`, `/menu`, `/menu/allergeni` (200) e `/gestione-menu` senza login (307).
- Prima di scrivere codice leggi le guide di Next 16 in `node_modules/next/dist/docs/` (lo chiede `AGENTS.md`): non è il Next che conosci.

### Ambiente locale per provare
1. `npm ci` fallisce al `postinstall` senza database: poi `DATABASE_URL=postgresql://u:p@localhost:5432/x DATABASE_URL_UNPOOLED=postgresql://u:p@localhost:5432/x npx prisma generate`.
2. Postgres: `pg_ctlcluster 16 main start`; ruolo `orari` (password `orari`, superuser) e database `orari_test`. `.env.local`: `DATABASE_URL` e `DATABASE_URL_UNPOOLED` verso quel database, `NEXTAUTH_SECRET=local-test-secret-not-for-production`, `NEXTAUTH_URL=http://localhost:3100`. Poi `npx prisma migrate deploy`.
3. `npm i --no-save playwright-core`; Chromium è in `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
4. Utenti di prova e test (password a tua scelta, solo locali):
   ```
   export E2E_ADMIN_PASSWORD=admin-locale E2E_EMPLOYEE_PASSWORD=dip-locale
   DATABASE_URL=… node scripts/menu-e2e/seed.mjs        # andrea (titolare), francesco (senza permesso), marta (con permesso)
   npx next dev -p 3100 &                                # prima: fuser -k 3100/tcp se la porta è occupata
   node scripts/menu-e2e/public-menu.mjs                 # pagine pubbliche e accessi (22 controlli)
   node scripts/menu-e2e/editor.mjs                      # gestione, permessi, storico (53 controlli)
   node scripts/menu-e2e/allergens-import-cover.mjs      # allergeni, incolla in blocco, coperto (50 controlli)
   ```
   `SHOTS=<cartella>` salva le schermate. Gli script ripuliscono i dati di prova all'inizio (usano `psql` con `orari/orari`).
5. Prima di ogni PR: `npx tsc --noEmit`, `npm run lint`, `npm run build` in locale. Poi rimuovere `.env.local` e fermare dev server e Postgres.

### Trappole già incontrate
- Una regola globale `* { border-color: var(--border) }` (fuori da ogni layer) batte le utility di Tailwind: nel menù pubblico i filetti si colorano con classi in `menu.css`.
- `next/font/google` con più pesi su Turbopack dà errore: usare font variabili senza `weight`.
- I componenti client non devono importare `src/lib/menu.ts` (porta con sé Prisma e `next/cache`): usare `menu-format.ts`.
- `innerText` applica `text-transform: uppercase`: nei test confrontare senza distinzione di maiuscole. Il coperto contiene uno spazio non separabile (`€ 1,00`).
- Nel test, il login richiede `waitUntil: "networkidle"` (idratazione) e `waitForURL(..., { waitUntil: "commit" })`. Il primo accesso di un dipendente mostra un modale «Installa l'app» che copre i clic: chiuderlo con «Ricordamelo più tardi».
- Un `next dev` rimasto su una porta occupata serve file vecchi: `fuser -k 3100/tcp` e riavviare.
- `revalidatePath` serve per ogni pagina pubblica nuova (vedi `revalidateMenu()` in `src/lib/menu.ts`).
