# Menù pubblico via QR: passaggio di consegne

Documento per riprendere il lavoro da un'altra sessione. Scritto per chi non ha visto la conversazione. Aggiornalo a ogni passo concluso.

Il titolare (L'Angolo del Vino, enoteca a Scandicci) parla italiano: risposte brevi, in italiano, senza gergo. Ha autorizzato a procedere in autonomia (commit, PR, merge e deploy) per questo lavoro, e ha chiesto: **alla fine di tutto, sempre un giro approfondito di bug e UX** (mobile, tablet, PC).

## Cosa è già in produzione

PR #30, #31 (menù, allergeni, incolla in blocco, coperto), #32 (questo documento), #33 (eventi), #34 (numeri allergeni, chiusura cucina) e #35 (vista allergeni da compilare, campi data dei fogli evento, progetto dei blocchi) sono su `main`.

- **`/menu`** (pubblico, senza login, non indicizzato): copertina, barra sezioni, 7 sezioni e 71 voci, vini esauriti nascosti, piatti esauriti sbiaditi, **coperto e chiusura cucina come blocchi informativi** (vedi sotto), link a `/menu/allergeni`. Cache con `revalidate = 60` più `revalidateMenu()` a ogni modifica.
- **Allergeni sul menù** (numerazione ufficiale 1–14): accanto a ogni piatto i numeri degli allergeni (es. "Allergeni 7 · 12"); in fondo al menù e al menù speciale degli eventi la **legenda numerata**; un piatto da compilare dice "Allergeni da verificare con il personale" (mai una riga vuota che sembri sicura); i vini non hanno numeri (nota "I vini contengono solfiti" nella legenda).
- **`/menu/allergeni`** (pubblico): stessi dati con filtro "devi evitare qualcosa?" e legenda; si raggiunge da "Cerca per allergene".
- **`/gestione-menu`** (login + permesso): in alto il riquadro «Informazioni del menù» (blocchi con tipo, dove compaiono, date, frecce, «+ Aggiungi»); ogni sezione mostra subito i suoi testi ("Testi di questa sezione" + Modifica, senza aprire fogli); l'avviso "N piatti hanno gli allergeni da compilare" è un pulsante («Vedi i piatti →») che apre la vista «da compilare»: pannello fisso in alto con avanzamento («19 di 21 piatti compilati · 2 da fare», barra `role=progressbar`), «Prossima sezione →», «Mostra tutto»; sulle righe «Compila» al posto di «Esaurito»; nel foglio del piatto «Salva e vai a «…»» passa al prossimo da compilare; voci (aggiungi, modifica, duplica, elimina, sposta, "Esaurito", "Riattiva tutto"), gruppi, testi di sezione, coperto unico, allergeni per piatto, "Incolla più voci" con anteprima, storico con annulla e ripristina.
- **Permessi**: titolare e consulente sempre; un dipendente solo con l'interruttore "Può modificare il menù" in Dipendenti (`Employee.canEditMenu`, letto dal database a ogni richiesta). Ogni Server Action chiama `requireMenuEditor()` (`src/lib/guard.ts`).
- **Proxy** (`src/proxy.ts`): apre al pubblico solo `menu(?:/|$)`. L'elenco esclude per prefisso: l'area di gestione sta sotto `/gestione-menu` apposta.
- Il link del QR stampato (qrco.de/bes4Ad, QR Code Generator) **non va toccato**: lo ripunta il titolare quando vuole.

### Mappa dei file
- Pubblico: `src/app/(public)/menu/` (`page.tsx`, `menu-nav.tsx`, `menu.css`, `ornament.tsx`, `allergeni/`). Assets in `public/menu/` (`hero.jpg`, `logo.png`).
- Gestione: `src/app/(app)/gestione-menu/` (`actions.ts`, `menu-editor.tsx`, `item-sheet.tsx`, `import-sheet.tsx`, `side-sheets.tsx`, `sheet.tsx`, `page.tsx`).
- Logica: `src/lib/menu.ts` (solo server: database, `revalidateMenu`), `src/lib/menu-format.ts` (pura, usabile nel client: prezzi, giorno commerciale, `nb`), `src/lib/menu-import.ts`, `src/lib/allergens.ts`.
- Dati: modelli `MenuSection`, `MenuGroup`, `MenuItem`, `MenuChange` (storico), `MenuBlock` (informazioni: coperto, chiusura cucina, avvisi), `MenuSetting` (vuota, per il futuro) in `prisma/schema.prisma`. Le migrazioni si applicano al deploy (`npm run build` = `prisma migrate deploy && next build`).
- Il giorno commerciale cambia alle 5:00 ora italiana (`businessDayKey`). "Esaurito" = `soldOutDay` uguale al giorno corrente: si azzera da solo, nessun cron.

## Regola del titolare: numero di versione
Il titolare vuole **sempre il numero di versione sia sul sito sia nella chat**.
- Sul sito: etichetta `v0.5.2 · <commit>` (`src/lib/version.ts`, valori iniettati da `next.config.ts`: `version` di `package.json` + primi 7 caratteri di `VERCEL_GIT_COMMIT_SHA`). Compare in fondo a ogni pagina dell'app (`app-shell.tsx`), sotto il modulo di accesso (`login/page.tsx`) e, discreta, nel piede del menù pubblico.
- **A ogni rilascio aumenta `version` in `package.json`** (minore per una funzione nuova: 0.3.0, 0.4.0…; ultima cifra per correzioni). Oggi: **0.5.2**.
- In chat: a ogni risposta che riguarda un rilascio scrivi «Versione X.Y.Z» (quella pubblicata in produzione, verificata sul sito).

## ATTENZIONE: una sola sessione alla volta
Il 2 ottobre due sessioni hanno lavorato insieme sullo stesso repo (stesso database per anteprime e produzione): una migrazione distruttiva eseguita da un'anteprima (`20261004100000_menu_blocks`, toglie `coverApplies`) ha rotto la rigenerazione di `/menu` in produzione finché il codice nuovo non è stato unito. **Prima di iniziare controlla `git branch -r` e i commit recenti; non pubblicare migrazioni da più branch; ogni push di un branch con migrazioni le esegue sul database condiviso.**

## Giro di bug e UX del 2 ottobre (v0.2.1)
Trovato e corretto: barra sezioni del menù che in fondo alla pagina restava su «Tartare» invece di «Bevande»; nomi molto lunghi o prezzi con decimali/migliaia che si sovrapponevano ai prezzi sul menù pubblico (colonne prezzo ora `min-w`, testo con `overflow-wrap:anywhere`); nomi e sottotitoli delle righe in gestione tagliati con «…» (ora fino a 2 righe); fogli di gestione senza `overscroll-contain` (la pagina dietro poteva scorrere). Controllati senza difetti: nessun overflow orizzontale a 360/390/834/1366 px su menù, allegeni e gestione; Esc chiude i fogli; campi data nei fogli evento. Note: a 1366 px il contenuto della gestione (max-w-5xl) è un po' più stretto del banner e dell'intestazione (max-w-6xl): solo estetica. Suite al termine: public 23, editor 53, allergeni 56, compile-flow 12, eventi 40.

## Tutto ciò che MANCA da fare (riepilogo, in quest'ordine consigliato)
1. ~~Vista allergeni da compilare~~ **FATTO (v0.3.0)**: pulsante «Compila allergeni (N da fare)», foglio «Allergeni · 1 di N», «Salva e passa al successivo» / «Salta questo piatto».
2. ~~Blocchi informativi~~ **FATTO (v0.3.0)**, vedi sotto.
3. ~~Passo 2: copertina, orari, contatti~~ **FATTO (v0.4.0)**, vedi sotto.
4. ~~Passo 3: «Oggi fuori menù»~~ **FATTO (v0.5.0)**.
5. ~~Passo 4: strumenti per i clienti~~ **FATTO (v0.5.0)**: ricerca, filtri, testo grande, «Torna su».
6. ~~Passo 5: comodità per chi gestisce~~ **FATTO (v0.5.0)**: ricerca di una voce con «Esaurito», anteprima da telefono. Il riquadro «Da fare» non serve: l'unico avviso utile (allergeni) è già in cima alla gestione.
7. ~~Generatore del QR code~~ **FATTO (v0.5.0)**: «Codice QR» in gestione (SVG/PNG). Il QR stampato (qrco.de/bes4Ad) NON è stato toccato: lo ripunta il titolare dopo aver compilato gli allergeni.
8. **Modalità servizio**: implementata, **NON in produzione** finché il titolare non l'ha vista (vedi sotto).
8b. **Abbinamento consigliato** (piatto → vino): implementato sullo stesso branch della modalità servizio, **non ancora in produzione** (vedi sotto). Per pubblicarlo senza la modalità servizio va separato su un branch suo: chiedere prima al titolare.
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

### Blocchi informativi — FATTO (v0.3.0)
Coperto, chiusura cucina e qualsiasi altra informazione sono **blocchi** (`MenuBlock`), tutti uguali:
- **Tre tipi**: testo (paragrafo in corsivo), voce con prezzo (riga in maiuscoletto bordeaux, es. «COPERTO € 1,00»), avviso (riquadro con filetti).
- **Dove**: in cima (sotto «In evidenza», sopra la barra sezioni), in fondo (sopra la legenda allergeni), oppure sotto il titolo di una o più sezioni (`sectionIds`, menù speciali degli eventi compresi). Nessun «dopo un gruppo preciso».
- **Quando**: `startDate`/`endDate` facoltativi (giorno commerciale); `hidden` = «Nascondi per ora»; ordine con le frecce dentro lo stesso punto.
- **Migrazione** `20261004100000_menu_blocks`: `MenuSetting` `cover` → blocco `blk_cover` (voce con prezzo «Coperto», 100 centesimi; se il testo non è «etichetta € importo» resta un testo), `kitchenNote` → `blk_kitchen_note` (testo), entrambi sotto le sezioni che avevano `coverApplies`; poi eliminati `MenuSetting` cover/kitchenNote, il loro storico e la colonna `MenuSection.coverApplies`.
- **Gestione**: riquadro «Informazioni del menù» in alto (`block-ui.tsx`: `BlocksPanel`, `BlockSheet`), azioni in `block-actions.ts` (`saveBlock`, `deleteBlock`, `moveBlock`), storico/annulla con l'entità `block` (`RESTORABLE.block`). La scheda «Testi di questa sezione» elenca i blocchi della sezione. Nel foglio di un evento si sceglie quali blocchi mostrare nel suo menù speciale (`blockIds`, sincronizzati da `src/lib/menu-block-sync.ts`; la duplicazione copia gli stessi).
- **Pubblico**: `src/app/(public)/menu/menu-blocks.tsx` (`MenuBlocks`, `MenuBlockItem`) per i tre punti; `loadBlocks`/`loadVisibleBlocks` in `src/lib/menu.ts`; helper puri (`blockStatus`, `priceLine`, `blockSummary`…) in `menu-format.ts`.
- Test: `scripts/menu-e2e/blocks.mjs` (46 controlli). Le suite usano `DB` e `resetBlocks()` di `scripts/menu-e2e/lib.mjs`.

### Passo 2: copertina, orari, contatti — FATTO (v0.4.0)
Gestione: riquadro «Il locale · copertina, orari, contatti» (3 righe con «Modifica») sotto «Informazioni del menù».
- **Copertina** (`HeroSheet`): titolo fino a 3 righe («e Menù» tiene la «e» in corsivo) e foto di sfondo caricabile (ridimensionata sul telefono, tabella `MenuHeroImage`, servita da `/menu/copertina?v=`); «Torna alla foto predefinita». Copertina più bassa (max 560 px).
- **Orari** (`HoursSheet`): 7 giorni con fasce anche spezzate («Come il giorno prima»), eccezioni per data (chiuso oppure aperto con orario, motivo, e «Pubblica anche un annuncio sul menù» che crea un annuncio in «In evidenza»); interruttore «Aperto ora / Chiuso». Lo stato si calcola **sul telefono** (`OpenStatusPill`, ora di Roma, `openStatus` in `src/lib/menu-venue.ts`), quindi resta giusto anche con la pagina in cache. In fondo al menù la tabella degli orari raggruppa i giorni uguali.
- **Contatti** (`ContactsSheet`): telefono, messaggio WhatsApp, indirizzo, Instagram, link recensione (https obbligatorio). In fondo al menù pulsanti Chiama / WhatsApp / Come arrivare / Lascia una recensione / Instagram, ognuno compare solo se ha il dato.
- Dati: impostazioni JSON `hero`, `hours`, `contacts` in `MenuSetting` (valori di partenza inseriti dalla migrazione `20261004140000_menu_venue`: orari della scheda Google, telefono 338 327 7053, Via dei Rossi 53/C, Instagram e recensione indicati dal titolare); salvataggi nello storico con «Annulla» (la foto no). Codice: `src/lib/menu-venue.ts` (puro), `loadVenue()` in `menu.ts`, `venue-actions.ts`, `venue-ui.tsx`, pubblico `open-status.tsx`, `venue-footer.tsx`, `copertina/route.ts`.
- Test: `scripts/menu-e2e/venue.mjs` (30 controlli; orologio del browser bloccato su lunedì 5/10/2026 19:00; richiede `sharp`).
- Da fare dal titolare: provare dal telefono il link della recensione (`https://share.google/ads9ad7vXNVdN2B4t`) e confermare il testo del messaggio WhatsApp.

- Copertina più bassa (circa metà schermo); foto e righe del titolo modificabili dalla gestione.
- Orari per giorno (anche spezzati) + eccezioni per data (aperture/chiusure straordinarie) + indicazione automatica «Aperto ora · chiude alle 22:00» / «Chiuso · riapre domani alle 16:30»; non compare se mancano gli orari. Dalla scheda Google: lun e mar 17–21:30; mer, ven, sab 10–13 e 16:30–22; gio 10–13 e 16:30–22:30; dom 16:30–21.
- Contatti in un solo posto, modificabili: telefono 338 327 7053, indirizzo Via dei Rossi 53C, 50018 Scandicci FI, Instagram `https://www.instagram.com/langolo.del.vino_enoteca/`, recensione Google `https://share.google/ads9ad7vXNVdN2B4t` (porta al profilo Google dell'attività, da cui si scrive la recensione con un tocco in più; il link diretto alla finestra di recensione si prende da Profilo dell'attività → "Chiedi recensioni" e si può sostituire dalla gestione). Pulsanti: Chiama, WhatsApp (messaggio precompilato per prenotare), Come arrivare (Google Maps), Lascia una recensione, Instagram; un pulsante senza dato non compare.

### Passo 3: «Oggi fuori menù» — FATTO (v0.5.0)
Piatti e vini che valgono solo oggi (il giorno cambia alle 5:00), con gli stessi campi e lo stesso editor delle voci normali.
- **Dati**: due sezioni speciali `oggi-piatti` (FOOD) e `oggi-vini` (WINE) con `MenuSection.dailyOnly = true`, un gruppo ciascuna; le voci hanno `MenuItem.onlyDay` (giorno commerciale di validità). `loadMenu()` le esclude (non sono sezioni fisse); `loadDaily(dayKey)` e `loadDailyRecent(dayKey)` in `src/lib/menu.ts`. Migrazione `20261005120000_menu_daily`.
- **Gestione**: riquadro «Oggi fuori menù» in cima (`daily-ui.tsx`): «+ Piatto», «+ Vino» (aprono l'editor normale), «Togli» (con Annulla), «Riproponi (N dei giorni scorsi)» (copia la voce con `onlyDay` = oggi, ultimi 14 giorni; le voci più vecchie di 60 giorni si cancellano a ogni «Riproponi»). Azioni: `saveItem` imposta `onlyDay` alla creazione, `reproposeItem` in `actions.ts`.
- **Pubblico**: sezione «Oggi fuori menù» in cima, con chip «Oggi» (nessun numero romano: le altre restano I, II…); ogni gruppo ha il proprio tipo (`group.kind`) per prezzi e allergeni. Anche i piatti del giorno compaiono in `/menu/allergeni`.
- Test: `scripts/menu-e2e/daily.mjs` (22 controlli).

### Passo 4: strumenti per i clienti — FATTO (v0.5.0)
Nella barra sezioni, a destra, due strumenti discreti; più «Torna su».
- **Ricerca** (`menu-search.tsx`): a tutto schermo, per nome, zona, uvaggio, ingredienti, anche senza accenti; filtri «Al calice» e «Enomatic»; scegliendo un risultato si torna al menù e la voce si evidenzia (classe `menu-found`, ancore `#v-<id>` sulle righe).
- **«Aa» testo più grande**: `html[data-menu-large]` ingrandisce `.menu-main` (zoom 1.16), scelta ricordata nel browser (`localStorage`, chiave `menu-text-large`).
- **«Torna su»**: pulsante rotondo che compare dopo circa 1,2 schermate.
- Test: `scripts/menu-e2e/tools.mjs` (22 controlli).

### Passo 5: comodità per chi gestisce — FATTO (v0.5.0)
- **Cerca una voce** (`search-ui.tsx`): campo in cima alla gestione, trova in tutto il menù (fisso, eventi, oggi) e segna «Esaurito» con un tocco; toccando il nome si apre la modifica.
- **Anteprima** (`PreviewSheet` in `side-sheets.tsx`): il menù dei clienti in una cornice da telefono, con «Aggiorna».
- Test: `scripts/menu-e2e/search.mjs` (11 controlli).
- **Modalità servizio**: implementata ma **NON in produzione** (vedi sotto).

### Modalità servizio — IMPLEMENTATA, NON IN PRODUZIONE (PR aperta, non unire)
Il titolare l'ha voluta pronta ma **non pubblicata finché non l'ha vista lui** («potrebbe essere inutile o addirittura dannosa»). La PR resta aperta/bozza: **non unirla a `main` senza il suo ok esplicito**. Il codice sta sul branch `claude/come-siamo-messi-vwh9qc` (PR aperta: finché non c'è l'ok del titolare quel branch NON va unito e non va usato per altri rilasci: per altro lavoro partire da `main` con un branch nuovo). Per vederla: anteprima Vercel della PR (che usa lo STESSO database di produzione: gli interruttori cambiano davvero il menù di oggi → alla fine «Riattiva tutto»).
- Pagina `/gestione-menu/servizio` (`servizio/page.tsx`, `servizio/service-view.tsx`), stessi permessi della gestione; pulsante «Modalità servizio» nell'intestazione della gestione.
- Un elenco unico di tutte le voci (prima «Oggi fuori menù» e gli eventi in corso), ricerca, filtri Tutto/Vini/Piatti/Esauriti, interruttori grandi (72×40 px) solo sull'interruttore (la riga non è cliccabile), nessuna modifica possibile; schermo sempre acceso (Wake Lock, dove disponibile); toast con «Annulla»; «Riattiva tutto» con doppia conferma; errori di rete: l'interruttore torna com'era.
- Test: `scripts/menu-e2e/service.mjs` (27 controlli).
- Rischi da valutare con il titolare: tocchi accidentali mentre si scorre (mitigati: solo l'interruttore, annulla, storico); più persone che segnano la stessa voce (vale l'ultimo); rumore in una sala poco connessa.

### Abbinamento consigliato — IMPLEMENTATO, NON ANCORA IN PRODUZIONE
Deciso con il titolare (2 ottobre): **un solo vino per piatto**, niente striscia «Consigliati», niente pagina «Cosa bevo con…?», **niente etichetta «Consigliato» sui vini** (provata e tolta: si punta solo sull'abbinamento dal piatto al vino).
- Dati: `MenuItem.pairWineId` (solo piatti del menù fisso; nessuna chiave esterna). Migrazioni `20261006100000_menu_pairing` (aggiunge `pairWineId` e `recommended`) e `20261006110000_menu_drop_recommended` (toglie `recommended`, mai usata in produzione). Le migrazioni già girate sul database condiviso tramite anteprima **non vanno modificate**: si aggiunge una migrazione nuova.
- Gestione: nella scheda del piatto «Abbinamento consigliato (facoltativo, un vino)»: si cerca un vino del menù fisso per nome, zona o sezione e lo si sceglie; ✕ lo toglie. In elenco: «Abbinamento: Mastrojanni». Server: il vino deve essere di una sezione vini fissa (no eventi, no «Oggi fuori menù»); per piatti di eventi e «Oggi fuori menù» il campo non c'è. Vino eliminato: la scheda lo dice e al salvataggio l'abbinamento cade. Duplica copia l'abbinamento. Storico e Annulla come sempre.
- Menù: sotto il piatto un riquadro «velatura dorata» (scelto dal titolare tra varie proposte): «ABBINAMENTO CONSIGLIATO», nome del vino in corsivo bordeaux, sottotitolo, regione (e paese se non Italia), prezzi a colonne con calice e bottiglia come nella carta. Il tocco porta al vino e lo illumina; in basso «← Torna a «Piatto»» (`pairing.tsx`) che riporta al piatto e sparisce se si scorre lontano. Vino esaurito/eliminato o piatto esaurito: niente riquadro. Senza JavaScript è un link all'ancora `#v-<id>`.
- Provenienza: `originLabel()` in `menu-format.ts` mostra la regione e il paese **solo se non è Italia** (vale anche per la riga sotto il vino e per la ricerca).
- Regione/paese dei vini già in carta: migrazione `20261006120000_menu_wine_origins` (riempie solo i campi vuoti; valori confermati dal titolare: Villa della Torre → Veneto, Colletto → Lombardia, Borgo Canedo → Friuli-Venezia Giulia; Atma White solo «Grecia» e M. Chapoutier «Rouge Clair» solo «Francia», è un Vin de France; Skyphos → Macedonia Centrale · Grecia (migrazione `20261006130000`, IGP Macedonia, Naoussa)). Attenzione: girando anche dalle anteprime, questi dati compaiono subito anche in produzione (che mostra già la riga regione · paese).
- Test: `scripts/menu-e2e/pairing.mjs` (33 controlli).

### Codice QR — FATTO (v0.5.0)
«Codice QR» tra i pulsanti della gestione (`QrSheet`, libreria `qrcode`): indirizzo del sito da cui si sta lavorando + `/menu`, colore nero o bordeaux, download SVG (stampa) e PNG 1600 px. Test: `scripts/menu-e2e/qr.mjs` (8 controlli, legge il QR con `jsqr`; richiede `npm i --no-save sharp jsqr`).

### v0.5.1 — rifiniture
- In gestione i riquadri «Informazioni del menù» e «Il locale» sono **chiusi di default** (una riga di riepilogo con freccia): la lista del menù sale in alto. I test li aprono con `expandPanels(page)` in `lib.mjs`.
- Sul menù l'uvaggio in corsivo è un po' più grande e più scuro (`font-medium`, 16 px): il corsivo sottile di EB Garamond rendeva male alcune parole («Ri sling»: nel database il testo è corretto, «Riesling»).
- Da confermare con il titolare (possibili refusi, non toccati): «Spoma?» (sottotitolo di Angol d'Amig) e «Costaripa Créant» (Mattia Vezzola).

### Altre modifiche di v0.5.0
- Gruppo «Metodi classici» → **«Metodo classico»** (migrazione `20261005100000`; la sezione si chiama già Bollicine).
- **Rossi** divisi in «Italia» ed «Estero» (i due francesi: Famille Lançon, M. Chapoutier); i Bianchi hanno già «Italia» e «… dal mondo» (se il titolare vuole lo stesso nome, si rinomina dalla gestione). Migrazione `20261005110000`.
- **Regione e Nazione** facoltative per i vini (`MenuItem.region`, `country`; campi nel foglio del vino; sul menù compaiono sotto il sottotitolo in maiuscoletto, es. «TOSCANA · ITALIA»). Per i vini già presenti sono vuoti, tranne la Nazione «Francia» dei due rossi esteri.

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
   node scripts/menu-e2e/blocks.mjs                      # blocchi informativi: tipi, punti, sezioni, date, nascondi, ordine, eventi, permessi (46 controlli)
   node scripts/demo-seed.mjs                            # (facoltativo, DOPO le suite) dipendenti, turni e ore inventati per provare e fotografare l'app
   node scripts/menu-e2e/venue.mjs                       # copertina, orari, contatti (30 controlli)
   node scripts/menu-e2e/daily.mjs                       # oggi fuori menù (22)
   node scripts/menu-e2e/tools.mjs                       # ricerca, testo grande, torna su (22)
   node scripts/menu-e2e/search.mjs                      # ricerca in gestione e anteprima (11)
   node scripts/menu-e2e/qr.mjs                          # codice QR (8; richiede jsqr)
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
