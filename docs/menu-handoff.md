# Menù pubblico via QR: passaggio di consegne

Documento per riprendere il lavoro da un'altra sessione. Scritto per chi non ha visto la conversazione. Aggiornalo a ogni passo concluso.

Il titolare (L'Angolo del Vino, enoteca a Scandicci) parla italiano: risposte brevi, in italiano, senza gergo. Ha autorizzato a procedere in autonomia (commit, PR, merge e deploy) per questo lavoro, e ha chiesto: **alla fine di tutto, sempre un giro approfondito di bug e UX** (mobile, tablet, PC).

## Cosa è già in produzione

PR #30, #31 (menù, allergeni, incolla in blocco, coperto), #32 (questo documento), #33 (eventi), #34 (numeri allergeni, chiusura cucina) e #35 (vista allergeni da compilare, campi data dei fogli evento, progetto dei blocchi) sono su `main`.

- **`/menu`** (pubblico, senza login, non indicizzato): copertina, barra sezioni, 7 sezioni e 71 voci, vini esauriti nascosti, piatti esauriti sbiaditi, **coperto e "chiusura cucina" unici** (impostazioni `cover` e `kitchenNote` in `MenuSetting`) mostrati insieme in tutte le sezioni di cucina (flag `coverApplies`), link a `/menu/allergeni`. Cache con `revalidate = 60` più `revalidateMenu()` a ogni modifica.
- **Allergeni sul menù** (numerazione ufficiale 1–14): accanto a ogni piatto i numeri degli allergeni (es. "Allergeni 7 · 12"); in fondo al menù e al menù speciale degli eventi la **legenda numerata**; un piatto da compilare dice "Allergeni da verificare con il personale" (mai una riga vuota che sembri sicura); i vini non hanno numeri (nota "I vini contengono solfiti" nella legenda).
- **`/menu/allergeni`** (pubblico): stessi dati con filtro "devi evitare qualcosa?" e legenda; si raggiunge da "Cerca per allergene".
- **`/gestione-menu`** (login + permesso): in alto il riquadro "Coperto e chiusura cucina" (testi leggibili + Modifica); ogni sezione mostra subito i suoi testi ("Testi di questa sezione" + Modifica, senza aprire fogli); l'avviso "N piatti hanno gli allergeni da compilare" è un pulsante («Vedi i piatti →») che apre la vista «da compilare»: pannello fisso in alto con avanzamento («19 di 21 piatti compilati · 2 da fare», barra `role=progressbar`), «Prossima sezione →», «Mostra tutto»; sulle righe «Compila» al posto di «Esaurito»; nel foglio del piatto «Salva e vai a «…»» passa al prossimo da compilare; voci (aggiungi, modifica, duplica, elimina, sposta, "Esaurito", "Riattiva tutto"), gruppi, testi di sezione, coperto unico, allergeni per piatto, "Incolla più voci" con anteprima, storico con annulla e ripristina.
- **Permessi**: titolare e consulente sempre; un dipendente solo con l'interruttore "Può modificare il menù" in Dipendenti (`Employee.canEditMenu`, letto dal database a ogni richiesta). Ogni Server Action chiama `requireMenuEditor()` (`src/lib/guard.ts`).
- **Proxy** (`src/proxy.ts`): apre al pubblico solo `menu(?:/|$)`. L'elenco esclude per prefisso: l'area di gestione sta sotto `/gestione-menu` apposta.
- Il link del QR stampato (qrco.de/bes4Ad, QR Code Generator) **non va toccato**: lo ripunta il titolare quando vuole.

### Mappa dei file
- Pubblico: `src/app/(public)/menu/` (`page.tsx`, `menu-nav.tsx`, `menu.css`, `ornament.tsx`, `allergeni/`). Assets in `public/menu/` (`hero.jpg`, `logo.png`).
- Gestione: `src/app/(app)/gestione-menu/` (`actions.ts`, `menu-editor.tsx`, `item-sheet.tsx`, `import-sheet.tsx`, `side-sheets.tsx`, `sheet.tsx`, `page.tsx`).
- Logica: `src/lib/menu.ts` (solo server: database, `revalidateMenu`), `src/lib/menu-format.ts` (pura, usabile nel client: prezzi, giorno commerciale, `nb`), `src/lib/menu-import.ts`, `src/lib/allergens.ts`.
- Dati: modelli `MenuSection`, `MenuGroup`, `MenuItem`, `MenuChange` (storico), `MenuSetting` (coperto) in `prisma/schema.prisma`. Le migrazioni si applicano al deploy (`npm run build` = `prisma migrate deploy && next build`).
- Il giorno commerciale cambia alle 5:00 ora italiana (`businessDayKey`). "Esaurito" = `soldOutDay` uguale al giorno corrente: si azzera da solo, nessun cron.

## Regola del titolare: numero di versione
Il titolare vuole **sempre il numero di versione sia sul sito sia nella chat**.
- Sul sito: etichetta `v0.2.1 · <commit>` (`src/lib/version.ts`, valori iniettati da `next.config.ts`: `version` di `package.json` + primi 7 caratteri di `VERCEL_GIT_COMMIT_SHA`). Compare in fondo a ogni pagina dell'app (`app-shell.tsx`), sotto il modulo di accesso (`login/page.tsx`) e, discreta, nel piede del menù pubblico.
- **A ogni rilascio aumenta `version` in `package.json`** (minore per una funzione nuova: 0.3.0, 0.4.0…; ultima cifra per correzioni). Oggi: **0.2.1**.
- In chat: a ogni risposta che riguarda un rilascio scrivi «Versione X.Y.Z» (quella pubblicata in produzione, verificata sul sito).

## Giro di bug e UX del 2 ottobre (v0.2.1)
Trovato e corretto: barra sezioni del menù che in fondo alla pagina restava su «Tartare» invece di «Bevande»; nomi molto lunghi o prezzi con decimali/migliaia che si sovrapponevano ai prezzi sul menù pubblico (colonne prezzo ora `min-w`, testo con `overflow-wrap:anywhere`); nomi e sottotitoli delle righe in gestione tagliati con «…» (ora fino a 2 righe); fogli di gestione senza `overscroll-contain` (la pagina dietro poteva scorrere). Controllati senza difetti: nessun overflow orizzontale a 360/390/834/1366 px su menù, allegeni e gestione; Esc chiude i fogli; campi data nei fogli evento. Note: a 1366 px il contenuto della gestione (max-w-5xl) è un po' più stretto del banner e dell'intestazione (max-w-6xl): solo estetica. Suite al termine: public 23, editor 53, allergeni 56, compile-flow 12, eventi 40.

## Tutto ciò che MANCA da fare (riepilogo, in quest'ordine consigliato)
1. **Vista allergeni da compilare**: il titolare non è convinto della barra fissa; decidere (vedi «Dubbio…» più sotto) e chiudere. Proposta: un solo pulsante «Compila allergeni (N da fare)» + foglio con «1 di N» e «Salva e passa al successivo».
2. **Blocchi informativi** (progetto più sotto): modello `MenuBlock`, tipi testo / voce con prezzo / avviso evidenziato, posizione cima / fondo / sotto il titolo di una o più sezioni (anche nei menù evento), finestra di date facoltativa, ordine con frecce; coperto e chiusura cucina diventano blocchi di sistema spostabili (migrare `cover` e `kitchenNote`). Attendere il via del titolare sul progetto.
3. **Passo 2: copertina, orari, contatti**: copertina più bassa con foto e titolo modificabili; orari settimanali con eccezioni (chiusure e aperture straordinarie) e «Aperto ora / Chiuso» automatico (dati iniziali dagli orari Google, il titolare ha mandato lo screenshot); contatti: Chiama (338 327 7053, modificabile), WhatsApp con messaggio precompilato (testo da confermare), Come arrivare (Via dei Rossi 53/C, Scandicci, indirizzo modificabile), Scrivi una recensione Google (`https://share.google/ads9ad7vXNVdN2B4t`, da verificare che sia il link giusto), Instagram (URL già dato dal titolare in chat: richiederlo se manca).
4. **Passo 3: «Oggi fuori menù»**: piatti e vini del giorno esauriti in una vista veloce, si azzera da solo alle 5:00, «Riproponi».
5. **Passo 4: strumenti per i clienti**: ricerca, filtri (Al calice, Enomatic), «Torna su», dimensione del testo (A+), discreti nella barra sezioni.
6. **Passo 5: comodità per chi gestisce**: ricerca di una voce, anteprima in cornice da telefono (affiancata sul PC), riquadro «Da fare».
7. **Generatore del QR code**: pagina in gestione, download SVG/PNG verso `/menu` (libreria `qrcode`); NON toccare il QR stampato (qrco.de/bes4Ad): lo ripunta il titolare dopo aver compilato gli allergeni.
8. **Modalità servizio**: solo progettare e discutere, NON implementare finché il titolare non conferma.
9. **Inglese**: oggi solo italiano, ma i dati sono pronti per le traduzioni (colonne `translations`); nessun costo: niente traduzione automatica a pagamento.
10. **In chiusura, sempre**: giro approfondito di bug e UX su telefono, tablet e PC (menù clienti e gestione), correggere, riassumere al titolare; aggiornare questo documento e il numero di versione.

Dati che inserisce il titolare (non codice): Oktoberfest 10–11 ottobre (titolo, locandina già inviata, birre e prezzi, piatti), etichette dei due kombucha, testo del messaggio WhatsApp, validazione del testo della pagina allergeni.

## Da fare, in quest'ordine (piano completo: vedi sotto)

### Passo 1: eventi e annunci — FATTO (PR «Eventi e annunci con locandina e menù speciale»)
Cosa fa, come voluto dal titolare:
- Area generica «Eventi e annunci» nella gestione (non solo Oktoberfest): due tipi, **annuncio** (titolo, testo, foto, date) ed **evento con menù speciale** (gruppi e voci dedicati, anche con più formati e prezzi, es. birra 0,2 l · 0,4 l · Maß 1 l). Tipo libero facoltativo (degustazione, cena a tema, serata a tema…) mostrato sopra al titolo. Tutto configurabile dalla gestione, anche da telefono, con gli stessi permessi.
- **Date**: «Mostra la locandina dal» (di default 7 giorni prima dell'inizio, si aggiorna da sola se non la tocchi), inizio, fine. Finita la data sparisce da sola. «Nascondi» forza lo stato. Giorno commerciale con cambio alle 5:00.
- **Sul menù dei clienti**: prima dell'evento una scheda nella striscia «In evidenza» sotto la copertina, che apre la pagina `/menu/p/<slug>` (condivisibile, con anteprima social e locandina); **nei giorni dell'evento si apre da sola a pagina piena subito dopo la copertina** con «Vai al menù ↓». Gli annunci restano nella striscia. Il menù speciale compare solo dall'inizio alla fine e il suo cibo entra nella pagina allergeni mentre l'evento è in corso. Link condiviso di un evento concluso = «concluso»; nascosto o eliminato = 404.
- **Memoria storica**: gli eventi conclusi vanno nell'«Archivio» della gestione con locandina, menù e formati; si possono rileggere e **duplicare** («Duplica per una nuova edizione»: copia testo, foto, gruppi, voci, formati e allergeni, si scelgono titolo e date). Eliminazione recuperabile dallo storico con «Annulla».
- Foto: scelta dal telefono, ridimensionata sul dispositivo (max 1200×1600 JPEG, sotto ~800 KB), salvata in Postgres (`MenuPromoImage`), servita da `/menu/p/<slug>/immagine` con cache lunga.

Dove sta nel codice:
- Modelli: `MenuPromo` (kind NOTICE|EVENT, slug, title, label, body, showFrom/startDate/endDate come giorni `YYYY-MM-DD`, hidden, deletedAt, dati foto), `MenuPromoImage`, `MenuSection.promoId` (il menù speciale è una sezione collegata, NON compare tra le sezioni fisse), `MenuItem.variants` (JSON `[{label, cents}]`, alternativo a `priceCents`). Migrazione `20261003100000_menu_promo`.
- Pubblico: `src/app/(public)/menu/in-evidenza.tsx` (striscia), `promo-content.tsx` (contenuto condiviso tra pagina dedicata e blocco aperto in `/menu`), `p/[slug]/page.tsx` e `p/[slug]/immagine/route.ts`, `item-prices.tsx` (formati).
- Gestione: `gestione-menu/promo-actions.ts` (crea, modifica, nascondi, elimina, duplica, foto), `promo-ui.tsx` (scheda, foglio di creazione/modifica, duplicazione), `menu-editor.tsx` (selezione sezione o pagina, elenco corrente e archivio), `item-sheet.tsx` (formati). Registro modifiche condiviso in `src/lib/menu-log.ts`; ridimensionamento foto in `src/lib/image-resize.ts`; helper date e stato in `src/lib/menu-format.ts` (`promoStatus`, `formatPromoDates`…).
- L'annullamento dello storico copre anche l'entità `promo` (campi in `RESTORABLE.promo`).

### Blocchi informativi: progetto concordato, NON ancora implementato
Richiesta del titolare: poter aggiungere "altre cose" al menù un domani (un tastino «+» nel riquadro in alto «Coperto e chiusura cucina»), decidendo **dove** piazzarle e **di che tipo** sono; anche coperto e chiusura cucina devono poter essere piazzati dove vuole. Soluzione: coperto e chiusura cucina diventano i primi due di tanti **blocchi** uguali.

Decisioni già prese con il titolare:
- **Tre tipi**: testo semplice; voce con prezzo (es. «Coperto € 1,00», «Servizio 10%», «Tavolo all'aperto + € 2»); avviso evidenziato (es. «Domenica cucina chiusa»).
- **Dove compare**: in cima al menù (sotto «In evidenza», sopra la barra sezioni), in fondo (sopra la legenda allergeni), oppure **sotto il titolo di una o più sezioni** (anche più sezioni insieme, compresi i menù speciali degli eventi). NON serve il posizionamento «dopo un gruppo preciso» (scartato: troppe scelte, punto fragile se si riordinano i gruppi).
- **Quando**: facoltativamente dal giorno X al giorno Y (giorno commerciale, come gli eventi); poi sparisce da solo. Interruttore «Nascondi».
- **Ordine**: più blocchi nello stesso punto si riordinano con le frecce.
- Aspetto: voce con prezzo = riga in maiuscoletto bordeaux («COPERTO € 1,00»); testo = paragrafo corsivo; avviso = riquadro con filetti. Coerente con il design del menù.

Progetto tecnico proposto:
```prisma
enum MenuBlockKind { TEXT PRICE NOTICE }
enum MenuBlockPlacement { TOP BOTTOM SECTIONS }
model MenuBlock {
  id String @id @default(cuid()); kind MenuBlockKind
  label String?        // es. "Coperto" (titoletto o etichetta del prezzo)
  text String?         // testo o avviso
  priceCents Int?      // solo PRICE
  placement MenuBlockPlacement
  sectionIds String[]  // solo SECTIONS: id delle MenuSection (anche sezioni collegate a eventi)
  startDate String?; endDate String?   // giorni commerciali, facoltativi
  hidden Boolean @default(false); sortOrder Int @default(0); deletedAt DateTime?
  createdAt DateTime @default(now()); updatedAt DateTime @updatedAt
}
```
- Migrazione dati: da `MenuSetting` `cover` → blocco PRICE «Coperto» (analizza «€ 1,00» → 100 centesimi; se non analizzabile, blocco TEXT) e da `kitchenNote` → blocco TEXT; entrambi con `placement = SECTIONS` e `sectionIds` = sezioni con `coverApplies = true`; poi eliminare `MenuSection.coverApplies` e le due impostazioni (la tabella `MenuSetting` può restare).
- Gestione: il riquadro in alto diventa «Informazioni del menù» con l'elenco dei blocchi (icona per tipo, riassunto, chip «Dove», date) e «+ Aggiungi blocco». Foglio di modifica: tipo (3 pulsanti), campi secondo il tipo, «Dove compare» (in cima / in fondo / sotto il titolo di sezioni + spunte delle sezioni, eventi compresi), «Dal / Al» facoltativi, Nascondi, Elimina, frecce per l'ordine. La scheda «Testi di questa sezione» elenca i blocchi che compaiono in quella sezione (con «Modifica»). Storico e «Annulla» come per il resto (nuova entità `block` in `RESTORABLE`).
- Pubblico: un componente `MenuBlocks` per i tre punti (sostituisce la logica di `coverApplies` in `page.tsx` e `promo-content.tsx`); blocchi scaduti o nascosti non compaiono; cache da rigenerare (`revalidateMenu`).
- Test: nuova suite `scripts/menu-e2e/blocks.mjs` (creazione dei tre tipi, i tre punti, sezioni multiple, date, nascondi, ordine, migrazione coperto/chiusura cucina invariata, permessi).

### Dubbio del titolare sulla vista «allergeni da compilare» (da risolvere)
Il titolare ha detto che la barra fissa con avanzamento «non lo convince tantissimo». Mia analisi: a 390 px occupa circa 80 px e copre le chip delle sezioni; il filtro è un modo in più da capire; la parte davvero utile è «Salva e vai al prossimo». **Proposta fatta, non ancora confermata**: sostituire barra e filtro con un solo pulsante «Compila allergeni (N da fare)» che apre il foglio del primo piatto mancante con contatore «1 di N» e «Salva e passa al successivo», lista normale senza barra fissa. Se il titolare conferma, farla (`menu-editor.tsx`: `foodSections`, `missingItems`, `nextMissing`, `compileMode`; `item-sheet.tsx`: `nextMissing`, `onNext`) e aggiornare `scripts/menu-e2e/compile-flow.mjs`; se indica un punto preciso, partire da quello.

### Passo 2: copertina, orari, contatti
- Copertina più bassa (circa metà schermo); foto e righe del titolo modificabili dalla gestione.
- Orari per giorno (anche spezzati) + eccezioni per data (aperture/chiusure straordinarie) + indicazione automatica «Aperto ora · chiude alle 22:00» / «Chiuso · riapre domani alle 16:30»; non compare se mancano gli orari. Dalla scheda Google: lun e mar 17–21:30; mer, ven, sab 10–13 e 16:30–22; gio 10–13 e 16:30–22:30; dom 16:30–21.
- Contatti in un solo posto, modificabili: telefono 338 327 7053, indirizzo Via dei Rossi 53C, 50018 Scandicci FI, Instagram `https://www.instagram.com/langolo.del.vino_enoteca/`, recensione Google `https://share.google/ads9ad7vXNVdN2B4t` (porta al profilo Google dell'attività, da cui si scrive la recensione con un tocco in più; il link diretto alla finestra di recensione si prende da Profilo dell'attività → "Chiedi recensioni" e si può sostituire dalla gestione). Pulsanti: Chiama, WhatsApp (messaggio precompilato per prenotare), Come arrivare (Google Maps), Lascia una recensione, Instagram; un pulsante senza dato non compare.

### Passo 3: piatti e vini del giorno
Sezione «Oggi fuori menù» in cima, che si azzera alle 5:00; «Riproponi» ripresenta quelli di ieri.

### Passo 4: strumenti per i clienti (nella barra sezioni, discreti)
Ricerca (nome, zona, uvaggio, ingredienti), filtri «Al calice» ed «Enomatic», «Torna su», «A+» per il testo grande (ricordato nel dispositivo).

### Passo 5: comodità per chi gestisce
Ricerca di una voce con interruttore Esaurito, anteprima in cornice da telefono (affiancata sul PC), riquadro «Da fare» (allergeni da compilare, esauriti da ieri, eventi in scadenza, orari straordinari mancanti).

**Modalità servizio (elenco unico solo per l'Esaurito, interruttori grandi, niente modifica per sbaglio): il titolare vuole che venga solo PROGETTATA e discussa, NON implementata finché non lo conferma.**

### Generatore del QR code (quando serve)
Pagina in gestione con download SVG e PNG verso `/menu` (libreria `qrcode`). Non cambia il QR attuale.

### In chiusura, sempre
Giro approfondito di bug e UX su telefono, tablet e PC, per entrambe le parti (menù dei clienti e gestione); correggere ciò che si trova, poi riassumere al titolare.

## Domande aperte per il titolare
- Oktoberfest: la locandina c'è (10–11 ottobre 2026, ore 17:00–22:00, "Birre, cibo e musica bavarese", 338 327 7053, Via dei Rossi 53/C Scandicci). Titolo, locandina, birre con formati e prezzi e piatti li inserisce il titolare dalla gestione: locandina visibile da 7 giorni prima (dal 3 ottobre), menù speciale solo il 10 e 11 (comportamento già così). Se serve, preparare io i dati da un suo elenco.
- Messaggio precompilato per WhatsApp (proposta: "Ciao, vorrei prenotare un tavolo per…").
- Validare il testo informativo della pagina allergeni.
- Kombucha Zenzero e Bergamotto: il titolare li compila lui dopo aver letto l'etichetta (oggi "da verificare").

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
   node scripts/menu-e2e/allergens-import-cover.mjs      # allergeni, numeri e legenda, incolla in blocco, coperto e chiusura cucina (56 controlli)
   node scripts/menu-e2e/compile-flow.mjs               # vista allergeni da compilare, «Compila», «Salva e vai a…» (12 controlli; azzera lo stato: tutto il cibo compilato tranne i due kombucha)
   node scripts/menu-e2e/events.mjs                      # eventi, annunci, formati, archivio, permessi (40 controlli; richiede `npm i --no-save sharp` se manca)
   ```
   Contro `next start` (build di produzione) esporta anche `E2E_PROD=1`: la suite degli allergeni aspetta 62 secondi perché le pagine pubbliche sono in cache. Esegui `events.mjs` per ultima: lascia un evento in corso che altera le altre suite.
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
- Nei test usare `getByLabel(..., { exact: true })` e `getByRole("button", { name, exact: true })`: i testi di aiuto e i pulsanti simili («+ Aggiungi un formato») rendono ambigue le ricerche per sottostringa.
- Un toast con «Annulla» dura 8 secondi: nei test lenti usare l'annullamento dallo storico.
- Campi data (`type="date"`) nei fogli: usare `dateInputClass` (`sheet.tsx`), con `min-w-0`; tre colonne in un foglio da 512 px tagliano la data. Locandina su riga intera, inizio/fine affiancati.
- Gli interventi diretti sul database non rigenerano le pagine in cache (60 s) quando si prova con `next start`.
