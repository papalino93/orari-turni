# Piano di lavoro sul menù (deciso con il titolare il 3 ottobre 2026)

Si pubblica man mano: ogni punto, una volta provato (test, giro su telefono, tablet e
computer, guida PDF aggiornata), va online da solo, e al titolare si scrive cosa è cambiato.
Se la sessione si interrompe, si riparte dal primo punto non spuntato. Lavoro autonomo
autorizzato fino alle 8:00 del 4 ottobre (ora italiana); si pubblica anche di notte.

## 1. Eventi
- [x] Sezione «In evidenza»:
  - 1 evento: come oggi;
  - 2 eventi: sul telefono uno sotto l'altro, tutti e due interi (sul tablet affiancati);
  - 3 o più: il primo in grande (il primo in «Riordina»), gli altri in una fila di locandine piccole.
- [x] Annunci (kind NOTICE) separati dagli eventi: una riga sobria sotto la copertina, prima
      degli eventi; si tocca per leggere tutto.
- [x] Pagina evento: orario facoltativo, inizio e fine tutti e due facoltativi («Dalle 19:00», «Dalle 19:00 alle 23:00»).
- [x] Pagina evento: pulsanti «Prenota» (WhatsApp con messaggio già scritto: evento e data,
      «Siamo in …»), «Aggiungi al calendario» (.ics con data, ora e indirizzo) e «Condividi»
      (condivisione del telefono, altrimenti copia del link).
- Niente pagina «Tutti gli eventi» (non serve al titolare).

Fatto e pubblicato nella v0.14.0 (4 ottobre, mattina).

## 2. Consigliati della casa e abbinamenti per il vino
(Test già scritto, codice da fare: scripts/menu-e2e/recommended.mjs. Campi previsti su
MenuItem: recommended, pairDishIds, pairHideIds; massimo 4 consigliati.)
- [ ] Segno «Consigliato» (scritta scelta dal titolare) su una voce (piatto o vino) dalla gestione, e sotto la copertina una
      riga «I consigli della casa» con le voci consigliate (massimo 4).
- [ ] Vino → «Sta bene con…»: da solo l'inverso degli abbinamenti piatto → vino, e in più
      piatti aggiunti o tolti a mano nella scheda del vino.

## 3. Duplica una voce
- [x] «Duplica» c'era già: ora è in cima alla scheda della voce e la copia si apre con
      l'avviso «Questa è una copia di …» (v0.14.0).

## 4. Costi e ricarichi
- [ ] Costo d'acquisto della bottiglia, visibile solo al titolare e al consulente (mai sul menù).
- [ ] Ricarico come moltiplicatore («×3,2») sulla bottiglia e sul calice, calcolato su quanti
      calici fa una bottiglia (5 di base, modificabile vino per vino).

## 5. Cambi programmati
- [ ] Voci stagionali: una voce visibile «dal … al …».
- [ ] Prezzi da una data: nella Tabella prezzi, «questi prezzi partono dal …».

## 6. Gestione a schede (fatta e pubblicata nella v0.15.0)
- [x] Quattro schede in alto: «Menù» (sezioni, voci, esauriti, Oggi fuori menù) · «Eventi e
      annunci» · «Orari e contatti» (copertina, orari, contatti, coperto e avvisi) ·
      «Strumenti» (Tabella prezzi, Riordina, Storico, Anteprima, Menù da stampare, Codice QR,
      Aggiungi più voci, Guida). Ogni scheda ha una riga che dice cosa c'è dentro. Si apre su «Menù».
- [x] Un solo «+ Aggiungi» in alto: «Vino, piatto, evento o annuncio?».
- [x] Scheda Menù: ricerca fissa in alto mentre si scorre; riquadro «Da sistemare» (solo se
      manca qualcosa: allergeni, prezzi, regione) con il pulsante per sistemarlo.
- Rimandati (il titolare non sapeva): righe più pulite, anteprima accanto sul computer.
- Anteprime viste dal titolare: https://claude.ai/artifact/RRd4rQeg8eubQd8wb2i7J6

## Messi da parte
- Carta intera nuova programmata: più avanti, se il titolare la vuole.
- Permesso limitato per il nuovo dipendente: il titolare decide più avanti.
- Modalità servizio (PR #44): per ora no.
- Menù in inglese, foto, bottiglie in cantina: non scelti per ora.
