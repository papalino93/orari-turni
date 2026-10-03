# Menù speciale degli eventi: PDF o foto, note e righe di testo

## Obiettivo

Per un evento che dura una sera non serve compilare il menù voce per voce: si
carica il menù già pronto (PDF o foto) e i clienti lo leggono dentro la pagina
dell'evento. In più, in ogni menù speciale si possono scrivere note e righe di
solo testo, e un avviso unico per gli allergeni.

## Cosa vede il titolare (gestione)

Nella pagina dell'evento, sopra il menù speciale, una scelta:

**Menù speciale: ( Voce per voce ) ( PDF o foto )**

- **Voce per voce**: come oggi (gruppi, voci, prezzi, formati), più:
  - **«+ Aggiungi testo»** dentro ogni gruppo: una riga senza prezzo né
    allergeni, che si sposta come le voci (es. «Tutti i piatti con pane fatto
    in casa»).
- **PDF o foto**:
  - **«Carica PDF o foto»**: un PDF fino a 6 pagine, oppure da 1 a 6 foto
    (menù stampato fotografato col telefono, immagine di Canva…).
  - Il PDF viene trasformato **nel browser** in immagini delle sue pagine
    (larghezza circa 1400 px, JPEG), come già si fa per le locandine: niente
    file pesanti sul server. Le foto vengono ridimensionate allo stesso modo.
  - Anteprima delle pagine in fila, con **«Sposta su/giù»** e **«Togli»** per
    ogni pagina, **«Sostituisci»** per ricaricare tutto. Un clic su una pagina
    la ingrandisce (stesso ingrandimento delle locandine).
  - Il PDF originale si conserva per il pulsante «Scarica il PDF» se non
    supera 5 MB; oltre, restano solo le pagine (e lo si dice).
- Cambiare scelta non cancella nulla: le voci o le pagine dell'altro tipo
  restano salvate ma non si vedono, finché non si torna indietro.

Per entrambi i tipi, in cima al menù speciale:

- **Note del menù**: testo libero facoltativo (es. «Menù degustazione per
  tutto il tavolo, prenotazione obbligatoria»).
- **«Allergeni: chiedi al personale»** (spunta, testo modificabile):
  - con **PDF o foto** è **sempre accesa** e non si può togliere (il sito non
    conosce gli allergeni del PDF);
  - con **voce per voce** è facoltativa; se accesa, i piatti di quell'evento
    **non chiedono più gli allergeni**: niente «Allergeni da compilare» in
    gestione (né nel conteggio di «Compila allergeni») e niente «da
    verificare» accanto ai piatti. Se un piatto li ha compilati, i numeri
    compaiono comunque.

## Cosa vede il cliente (menù)

Nella pagina dell'evento (e nel riquadro dell'evento in cima al menù nei
giorni dell'evento), sotto locandina e testo:

1. **Note del menù**, in corsivo.
2. Il menù:
   - **voce per voce**: come oggi, con le righe di testo tra le voci;
   - **PDF o foto**: le pagine una sotto l'altra, a tutta larghezza, con un
     tocco per ingrandire; sotto, un piccolo «Scarica il PDF» (se c'è).
3. **Avviso allergeni** (riquadro come gli altri avvisi del menù).

Il menù in PDF non entra nella ricerca dei clienti né nella pagina Allergeni
(lì l'evento compare con «chiedi al personale»).

## Comportamenti

- **Duplica evento** copia anche pagine, note e scelta del tipo.
- A evento finito tutto sparisce dal menù come oggi e resta nell'archivio.
- Ogni modifica (caricamento, ordine pagine, note, cambio tipo) va nello
  **Storico** con un solo «Annulla».
- Menù da stampare: gli eventi non ci sono, nessun cambiamento.
- Statistiche: l'apertura della pagina dell'evento si conta già; si aggiunge
  «Scarica il PDF» tra i contatti/eventi toccati.

## Parte tecnica

- Database (solo aggiunte, sicure per l'anteprima che usa il database vero):
  - `MenuPromo`: `menuMode` (`ITEMS` | `FILE`, predefinito `ITEMS`),
    `menuNote` (testo), `allergenNotice` (testo, null = spento).
  - Nuova tabella `MenuPromoPage` (promoId, ordine, immagine JPEG, larghezza,
    altezza) e `MenuPromoFile` (promoId, PDF originale, nome) come
    `MenuPromoImage`.
  - `MenuItem`: `textOnly` (booleano) per le righe di testo.
- Conversione PDF → immagini nel browser con `pdfjs-dist` (caricato solo
  quando si sceglie un PDF). Caricamento pagina per pagina (ognuna sotto il
  limite di dimensione delle azioni del server).
- Pagine servite da una rotta come quella della locandina
  (`/menu/p/[slug]/pagina/[n]`), in cache, con dimensioni per evitare salti.
- Test end-to-end nuovi: caricamento PDF di prova (2 pagine) e foto, ordine,
  togli, sostituisci, cambio tipo, note, avviso allergeni sempre acceso col
  PDF, righe di testo, duplica, annulla, vista cliente su telefono e tablet.
- Guida PDF aggiornata (pagina eventi + domanda frequente «Posso caricare il
  menù in PDF?») nello stesso rilascio.

## Decisioni

- **Pagine dentro il menù, non un link al PDF**: si legge senza uscire dal
  menù e senza download strani sui telefoni; il PDF resta scaricabile.
- **Avviso allergeni fisso con il PDF**: il sito non può sapere gli allergeni
  di un file; così si è sempre coperti.
- **Uno dei due tipi per evento**: niente doppioni o prezzi in contrasto tra
  PDF e voci.
- **PDF oppure foto, fino a 6 pagine**: copre il menù stampato fotografato e
  le grafiche fatte altrove, senza appesantire la pagina.
- **Note + righe di testo nei gruppi**: le note valgono per tutto il menù
  (anche il PDF), le righe servono tra le voci.
- **Con l'avviso acceso gli allergeni dei piatti dell'evento non sono
  richiesti**: per una sera sola basta l'avviso unico, meno lavoro.

## Domande aperte

- Nessuna bloccante. Da verificare col primo PDF vero: leggibilità delle
  pagine su telefono (se il PDF ha caratteri molto piccoli, l'ingrandimento
  con un tocco è la soluzione prevista).
