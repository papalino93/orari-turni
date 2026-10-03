@AGENTS.md

# Guida PDF della gestione del menù

Ogni volta che cambi la gestione del menù (`/gestione-menu`, `/statistiche`) o
qualcosa che il titolare vede o usa sul menù, aggiorna e rigenera la guida
`docs/guida/Guida-gestione-menu.pdf` (scaricabile dal pulsante «Guida») **nello
stesso rilascio**, senza aspettare che te lo chiedano. Istruzioni in
`scripts/guida/LEGGIMI.md`.

Prima di pubblicarla, sempre:
- testi, passi della guida e domande frequenti corrispondono all'ultima versione
  (nomi dei pulsanti identici a quelli sul sito, niente funzioni vecchie);
- versione aggiornata in copertina e nella domanda «Dove trovo il numero di versione?»;
- guarda **ogni pagina** del PDF come immagine: niente testo che esce dai riquadri
  o si sovrappone, numeri della schermata al posto giusto, foto aggiornate;
- il PDF resta fatto di immagini (`topdf3.mjs` + `unisci.py`): un PDF stampato dal
  browser mostra le ombre come riquadri grigi su iPhone;
- la gestione si fotografa da computer (Mac), il menù dei clienti da telefono.

# Giro bug e UX

Prima di ogni rilascio fai da solo il giro, senza aspettare segnalazioni:
`node scripts/menu-e2e/giro.mjs <cartella>` (telefono, tablet verticale e
orizzontale, computer, tema chiaro e scuro, con le schede della gestione aperte),
poi guarda le foto una per una. Oltre agli errori, cerca problemi di esperienza
d'uso: testi tecnici o da sviluppatore, finestre scomode, cose che non si capisce
dove fare, elementi che escono dal bordo.
