# Formati del gruppo (birre alla spina e simili)

## Obiettivo

Le birre alla spina dell'Oktoberfest hanno tutte gli stessi formati
(es. 0,2 l · 0,4 l · 1 l). Invece di scrivere i formati birra per birra,
si scrivono **una volta sul gruppo** e per ogni birra si mettono solo i
prezzi. Sul menù diventa una **tabella con una colonna per formato**, come
Calice e Bottiglia per i vini. È uno strumento generale, che serve anche per
gli eventi futuri e per il menù fisso.

## Cosa vede il titolare (gestione)

- Nell'intestazione di ogni gruppo, accanto a «Rinomina», un pulsante
  **«Formati»**: si scrivono i nomi delle colonne (da 2 a 4, es. «0,2 l»,
  «0,4 l», «1 l»), si riordinano, si tolgono. Vuoto = gruppo normale,
  come oggi.
- Più semplice ancora, dalla **scheda della prima birra**: in «Prezzo» si
  sceglie **«Più formati»**, si toccano i formati veloci (0,2 l · 0,3 l ·
  0,4 l · 0,5 l · 1 l) o se ne scrivono altri, con il prezzo accanto. La
  spunta **«Stessi formati per tutto il gruppo»** (accesa) li rende i formati
  del gruppo; si spegne per tenerli solo su quella voce. Non compare se nel
  gruppo ci sono già voci con un prezzo unico.
- Con i formati del gruppo, la scheda di una voce mostra **una casella di
  prezzo per ogni formato** al posto di «Prezzo» e «+ Aggiungi un formato».
  Casella vuota = quel formato per quella voce non c'è (sul menù «—»).
- **Descrizione** della voce con l'esempio «Paulaner · Helles · 5,5% vol.»
  (birrificio, stile, gradazione su una riga).
- La **Tabella prezzi** mostra le colonne dei formati del gruppo, come
  Calice/Bottiglia: si aggiornano tutti i prezzi della serata in un colpo.
- **«Incolla più voci»** in un gruppo con formati: colonne
  «Nome; Descrizione; <un prezzo per formato>».
- **«Esaurito»** resta sulla voce intera. Un formato finito si toglie
  svuotando il suo prezzo (Tabella prezzi).
- **Duplica evento** copia anche i formati dei gruppi: la prossima
  Oktoberfest è già pronta, si cambiano solo date e prezzi.

## Cosa vede il cliente (menù)

Intestazione del gruppo con i nomi dei formati in colonna (come il calice e
la bottiglia), poi una riga per birra: nome, descrizione sotto, prezzi
allineati nelle colonne. Su telefono fino a 4 colonne strette; i nomi lunghi
(«1 l») vanno su due righe nell'intestazione. Funziona in menù fisso,
eventi e «Oggi fuori menù». Il menù da stampare usa la stessa tabella.

## Comportamenti e casi limite

- Un gruppo che **già** ha voci con formati propri (come le birre di prova di
  oggi): quando si impostano i formati del gruppo, i prezzi con lo stesso
  nome di formato vengono portati nelle colonne; gli altri restano nella
  voce e la gestione li segnala per sistemarli («Formati diversi dal
  gruppo»). Nessun prezzo si perde.
- Togliere i formati del gruppo: le voci tornano con i loro formati in fila
  (si ricopiano i prezzi delle colonne), come prima.
- Ricerca dei clienti, abbinamenti, statistiche: invariati.
- Allergeni: come per i piatti (o l'avviso unico dell'evento, vedi
  `menu-evento-pdf.md`).
- Ogni modifica ai formati del gruppo va nello Storico, con «Annulla».

## Parte tecnica

- Database (solo aggiunte): `MenuGroup.formats` (JSON, elenco di nomi,
  null = nessuno). I prezzi restano in `MenuItem.variants` con le stesse
  etichette del gruppo: niente nuova tabella, la vista cliente e la stampa
  li leggono già.
- Validazione lato server: con formati del gruppo, le etichette delle
  varianti devono essere quelle del gruppo; almeno un prezzo per voce.
- Test end-to-end: imposta formati, voce con prezzi per colonna, casella
  vuota, tabella sul menù (telefono e tablet), Tabella prezzi, Incolla più
  voci, duplica evento, conversione di un gruppo con formati propri,
  togli formati, annulla.
- Guida PDF aggiornata (pagina eventi/strumenti + domanda frequente «Come
  metto le birre in più formati?») nello stesso rilascio.

## Decisioni

- **Formati scritti sul gruppo, prezzi sulla voce**: si scrive meno e sul
  menù diventa una tabella leggibile.
- **Strumento generale (ovunque)**: serve per eventi futuri e per il menù
  fisso (birre, amari 4/6 cl…); duplicando un evento i formati restano.
- **Birrificio, stile e gradazione nella descrizione**: una riga sola,
  niente campi in più da compilare.
- **«Esaurito» sulla birra intera**: meno pulsanti in sala; un formato finito
  si toglie dalla Tabella prezzi.
- **Casella vuota = formato non disponibile**: copre le eccezioni senza
  regole speciali.

## Domande aperte

- Nessuna bloccante.
