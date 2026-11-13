# Carta dei vini dell'enoteca: analisi e proposta

> Stato: **in pausa** (13 novembre 2026). Oggi l'enoteca non ha un inventario né un elenco dei
> vini da cui partire, quindi la carta non è attuabile. Si riprende quando esiste una base
> (anche solo un Excel con produttore, vino, annata, tipo e prezzo). Le domande per il titolare
> sono in fondo (§ 9).

## 1. Il punto di partenza

Oggi il menù del QR (`/menu`) ha già delle sezioni di vini (Bollicine, Bianchi, Rossi…): ogni vino
è una `MenuItem` con produttore, nome, denominazione, annata, uvaggio, regione, paese, prezzo al
calice e in bottiglia, caratteristiche (BIO, vegano…), «Sta bene con» e «Consigliato».

Quella però è la **selezione per l'aperitivo e la mescita**: poche decine di vini che girano.
La **carta dell'enoteca** è un'altra cosa:

| | Menù del QR (oggi) | Carta dei vini (nuova) |
|---|---|---|
| Quanti vini | 30–60 | probabilmente 200–800 |
| Cambia | ogni settimana | poche volte l'anno, più gli esauriti |
| Prezzo | calice + bottiglia | soprattutto bottiglia (più formati: mezza, magnum) |
| Chi la guarda | tutti, al tavolo, in fretta | chi vuole scegliere una bottiglia, con calma |
| Come si cerca | si scorre | si cerca e si filtra (tipo, regione, prezzo) |

**Verdetto: è fattibile e ha senso**, a patto di non farne un secondo menù da tenere aggiornato
a mano in parallelo. Tutto il progetto ruota su una regola: **un vino si scrive una volta sola**.

## 2. Le scelte di fondo (consigliate)

### 2.1 Un'anagrafica unica dei vini: la «Cantina»

Nuova tabella `Wine` (la cantina), separata dalle voci del menù:

- produttore, nome del vino, denominazione, **tipo** (bollicine, bianco, rosato, rosso,
  orange/macerato, dolce/passito, fortificato), metodo per le bollicine (classico, Charmat,
  ancestrale), paese, regione, zona/sottozona, uvaggio, gradazione (facoltativa);
- **annate**: una riga per annata (`WineVintage`) con il suo prezzo; «senza annata» per i
  Champagne sans année e simili. Così «Nuova annata» è un tocco: copia il vino, cambia l'anno,
  l'annata vecchia va in archivio da sola quando finisce;
- **formati** con prezzo: 0,375 · 0,75 · magnum 1,5 · altri (stesso sistema dei «formati» delle birre);
- caratteristiche (stesse di oggi: BIO, biodinamico, vegano, senza solfiti aggiunti);
- una nota breve per il cliente (2–3 righe, facoltativa) e una **nota interna** che il cliente
  non vede mai (es. «chiedere ad Andrea», «ultima cassa»);
- stato: **disponibile / esaurito / in archivio**. Esaurito qui vuol dire «finché non lo
  riprendo», non solo per oggi come nel menù.

**Niente prezzo d'acquisto né magazzino nella prima versione**: raddoppierebbero il lavoro di
inserimento e trasformerebbero la carta in un gestionale. Si valuta dopo (§ 8).

### 2.2 Il menù del QR prende i vini dalla Cantina (seconda fase)

Nella gestione del menù, aggiungendo un vino si potrà scegliere **«Prendi dalla carta»**: la voce
del menù resta (con il suo prezzo al calice e il suo posto), ma nome, annata, uvaggio e
caratteristiche arrivano dalla Cantina. Si aggiorna l'annata in un posto e cambia ovunque.

- I vini già nel menù **non si toccano**: il collegamento è facoltativo, uno alla volta, con un
  aiuto che propone «Questo vino sembra lo stesso della carta: collegarli?».
- Sulla carta, i vini collegati mostrano **«Anche al calice»** con il prezzo: è proprio il
  ponte tra aperitivo e bottiglia che il cliente cerca.

### 2.3 Dove sta

- Clienti: **`/menu/carta-vini`**, dentro il menù che già esiste. Dal menù del QR un riquadro in
  fondo alla sezione vini, e una voce nella barra: «Tutta la carta dei vini». **Il QR stampato
  non cambia** (qrco.de/bes4Ad continua a puntare a `/menu`).
- Gestione: nella gestione del menù una scheda nuova **«Carta dei vini»**, con gli stessi
  permessi di chi gestisce il menù (titolare, consulente e i dipendenti col permesso).
- Interruttore «Mostra la carta ai clienti» spento all'inizio, come per prenotazioni e Mail:
  si riempie con calma e si accende quando è completa.

## 3. Come la vede il cliente (telefono prima di tutto)

1. **Prima schermata**: titolo «La nostra carta dei vini», quanti vini ci sono, e grandi tessere
   per tipo con il numero: *Bollicine 64 · Bianchi 120 · Rosati 18 · Rossi 210 · Dolci 15*.
   Sopra, la ricerca sempre visibile («Cerca un vino, una cantina, un vitigno…»).
2. **Dentro un tipo**: vini ordinati per **paese → regione → produttore**, con titoletti che
   restano in alto scorrendo («Toscana · Chianti Classico»). Su ogni riga:
   *Produttore* in evidenza, *nome del vino* e denominazione sotto, annata a destra, prezzo
   della bottiglia ben leggibile. Un segno piccolo per BIO e simili (come oggi nel menù).
3. **Filtri** in una riga sola sotto la ricerca, a pillole: Regione · Fascia di prezzo
   (fino a 30 € · 30–50 · 50–80 · oltre 80) · BIO/naturali · Mezze e magnum · «Anche al calice».
   Il numero di vini trovati si aggiorna mentre si sceglie; «Togli i filtri» sempre visibile.
4. **Tocco su un vino**: un foglio dal basso con tutto (uvaggio, zona, gradazione, nota,
   formati e prezzi, «Anche al calice», «Sta bene con» se è anche nel menù). Niente pagine
   nuove: si chiude e si torna esattamente dove si era.
5. **Esauriti**: non compaiono. Mai far innamorare il cliente di una bottiglia che non c'è.
6. **Ricerca furba**: senza accenti e maiuscole, con errori piccoli («sangiovee» trova
   Sangiovese), anche per vitigno e regione.
7. **Tablet in orizzontale** (per chi la porta al tavolo): due colonne, elenco a sinistra e
   scheda a destra, come la vista larga della gestione.
8. **Stampa / PDF**: una versione da stampare impaginata bene (indice per tipo e regione,
   numeri di pagina) per chi la vuole di carta o per un'emergenza senza rete. Con lo stesso
   sistema del PDF degli eventi, quindi fatta di immagini e senza problemi su iPhone.
9. **Stile**: lo stesso del menù di oggi (Cormorant e Jost, colori del locale, tema chiaro e
   scuro), più «da carta»: righe sottili, numeri allineati, molta aria.

Prestazioni: 800 vini in una pagina sono pochi KB di testo; la pagina si genera sul server e si
aggiorna quando si modifica la carta. Niente caricamenti a pezzi, ricerca istantanea nel browser.

## 4. Come la gestisce il titolare

Il punto debole di ogni carta digitale è **inserirla la prima volta** e **tenerla aggiornata**.
Tutta la gestione è pensata su questo.

### 4.1 Prima volta: importazione

- **Da Excel / CSV**: incolli o carichi il file, il sito riconosce le colonne (produttore, vino,
  denominazione, annata, tipo, regione, prezzo…) e mostra un'**anteprima riga per riga** con
  quello che non torna in giallo («prezzo non letto», «tipo mancante»), prima di salvare nulla.
  Si parte dal sistema «Aggiungi più voci» che c'è già.
- **Dalla carta stampata o da un PDF**: se esiste solo su carta, si fotografa o si carica il
  PDF e si ricava un elenco da controllare. È la parte meno affidabile: la leggo io, e il
  titolare controlla l'anteprima prima di salvare.
- I **doppioni** (stesso produttore, vino e annata) si segnalano subito.

### 4.2 Tutti i giorni

- **Elenco da computer simile a un foglio Excel**: si cambia il prezzo, l'annata o «esaurito»
  direttamente nella riga, senza aprire niente; si salva da solo, con «Annulla».
- **Da telefono**: ricerca → tocco → «Esaurito» con un tocco. È l'uso più frequente
  (finisce una bottiglia durante il servizio).
- **Ritocco prezzi**: «aumenta del 5 % tutti i rossi della Toscana», con anteprima prima/dopo e
  arrotondamento al mezzo euro.
- **Nuova annata**, **Sposta in archivio**, **Ripristina** dall'archivio.
- **Storico delle modifiche** come per il menù («chi ha cambiato cosa e quando»).
- Avviso morbido se un vino è esaurito da più di 60 giorni: «Lo tieni in carta o lo archivi?».

## 5. Statistiche (si appoggiano su quelle del menù)

- Quante persone aprono la carta e da dove (menù, link diretto, evento).
- **Cosa cercano e non trovano** («barolo» cercato 12 volte, 0 risultati): il dato più utile per
  decidere cosa comprare.
- Vini più aperti, filtri più usati, fascia di prezzo più guardata.

## 6. Lingue

Il locale è vicino a Firenze: l'**inglese** sulla carta (titoli, filtri, tipi, frasi fisse) è
quasi gratis, perché produttori e nomi dei vini non si traducono. Le note brevi dei vini si
traducono solo se il titolare le scrive. Proposta: nella prima versione l'interfaccia della carta
già in italiano e inglese (pulsante IT · EN), le note solo in italiano.

## 7. Rischi e come li evito

| Rischio | Come si evita |
|---|---|
| Due carte da aggiornare (menù e carta) | Anagrafica unica (§ 2.1) e collegamento (§ 2.2) |
| Inserimento lunghissimo | Importazione con anteprima; la carta resta spenta finché non è pronta |
| Prezzi sbagliati in pubblico | Anteprima prima di ogni ritocco di massa; storico con ripristino |
| Bottiglie finite ancora in carta | «Esaurito» in un tocco da telefono; gli esauriti non si vedono |
| Rompere il menù di oggi | La carta è una pagina nuova e tabelle nuove: il menù di oggi non cambia finché non si collega un vino. Migrazioni solo aggiuntive |
| Lentezza con tanti vini | Pagina generata sul server, ricerca nel browser, foto delle etichette solo in una fase successiva e ridimensionate |
| Guida e prove | Guida PDF aggiornata nello stesso rilascio; prove automatiche nuove (import, ricerca, filtri, esauriti, collegamento) e giro foto su telefono, tablet e computer |

## 8. Fasi proposte

**Fase 1 (la carta, tutto il necessario).** Cantina con annate e formati; importazione da
Excel/CSV con anteprima; gestione (elenco tipo foglio, telefono con esaurito veloce, ritocco
prezzi, nuova annata, archivio, storico); pagina pubblica con tipi, ricerca, filtri e scheda;
interruttore; statistiche di base; guida PDF; prove.

**Fase 2 (il ponte).** «Prendi dalla carta» nel menù del QR e «Anche al calice» sulla carta;
aiuto al collegamento dei vini già presenti; PDF da stampare; IT · EN.

**Fase 3 (se servono).** Foto delle etichette; schede dei produttori; prezzo d'acquisto e
ricarico (solo gestione); magazzino semplice (bottiglie in cantina, sotto scorta); vini «da
vendere a casa» con prezzo da asporto.

## 9. Domande per il titolare (da fare insieme)

1. **Quanti vini** ha la carta oggi, più o meno? (100, 300, 800?)
2. **In che forma esiste**: Excel, Word, un gestionale, solo stampata?
3. **Prezzi**: solo bottiglia, o anche asporto (prezzo diverso per portarla a casa)?
4. **Mezze bottiglie e magnum**: ce ne sono abbastanza da meritare un filtro?
5. **Ordine preferito** dentro un tipo: per regione (come proposto) o per produttore, o per prezzo?
6. **Note sui vini**: le vuole scrivere (anche solo per i vini più importanti) o bastano i dati?
7. **Inglese** da subito sì o no?
8. **Chi la aggiorna** nella pratica: titolare, consulente, qualche dipendente?
9. **Prezzo d'acquisto / magazzino**: interessa davvero, o meglio tenerla semplice?
10. **Nome** della pagina per i clienti: «La carta dei vini», «La cantina», altro?

## 10. Stima

- Fase 1: 2–3 giornate di lavoro mio con le prove e il giro foto, più il tempo del titolare per
  controllare l'importazione (dipende da quanti vini e da com'è fatta la carta oggi).
- Fase 2: 1–2 giornate.
- Fase 3: da valutare punto per punto.
