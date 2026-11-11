# Sabato: prenotazioni, agenda ed email in uso vero

Analisi fatta l'11 novembre 2026 sulla versione online 0.37.2, leggendo tutto il codice con quattro
analisi indipendenti (prenotazioni in uso vero, email dal sito, infrastruttura, usabilità).
Decisioni già prese dal titolare: **niente Vercel Pro per ora**; **tutto resta su
orari-turni.vercel.app** (clienti su `/prenota`, personale su `/prenotazioni`), con al massimo un
**alias gratuito** tipo `angolodelvino.vercel.app` solo per i clienti; email con **Brevo** (o Resend)
sul dominio `langolodelvinoscandicci.com`; la sezione Mail la vedono **solo titolare e consulente**.

---

## 1. Il verdetto, onesto

| Compito | Con il sito, oggi | Perché |
|---|---|---|
| Guardare la serata da più posti insieme | **Meglio** | Si aggiorna da solo; due persone non confermano la stessa richiesta |
| Cercare «Rossi di sabato» | **Meglio** | Ricerca per nome, telefono, codice |
| Contare le persone | **Meglio** | Totale automatico (ma «tavoli» oggi è sbagliato, vedi sotto) |
| Sapere chi l'ha presa | **Meglio** | «Telefono · Marta», anche in stampa |
| Rispondere alle richieste online | **Meglio** di WhatsApp a mano | Due tocchi per decidere, messaggio già scritto |
| **Segnare al volo una telefonata** | **Peggio** | 25–40 secondi contro 8–12 con la penna; telefono obbligatorio |
| Capire se c'è posto per un gruppo | **Peggio** | Le persone già confermate si vedono *sotto* il pulsante Conferma, e non per orario |
| Clienti abituali | **Peggio** | Va riscritto tutto ogni volta |
| Senza rete | **Molto peggio** | Senza internet l'agenda non si apre → stampa del giorno obbligatoria |

**Conclusione:** conviene **solo** con 5–6 ritocchi piccoli prima di sabato (sezione 3), una persona
responsabile delle prenotazioni per sera e la stampa del giorno come scorta. Senza quei ritocchi il
consiglio è accendere sabato **solo l'agenda interna** e le richieste online la settimana dopo.

---

## 2. Problemi trovati che vanno sistemati PRIMA di sabato (codice)

**Prenotazioni e agenda**
1. **«Spegni» spegne anche l'agenda.** Con le richieste online spente, i dipendenti non vedono l'agenda e
   tutto ciò che si segna a mano diventa «di prova» (non conta). Senza Vercel Pro «Spegni» è l'unico freno
   d'emergenza contro lo spam, quindi non deve mai togliere l'agenda alla sala.
   → Due interruttori separati: **Agenda** (sempre accesa dopo il primo giorno) e **Richieste online**.
2. **Le prove restano «di prova» per sempre.** All'accensione: chiedere «Cancello le N prove?» (e, se il
   titolare ha già segnato prenotazioni vere, «Rendile vere»).
3. **Modalità rapida per le telefonate:** ordine Persone → Ora → Giorno → Nome → Telefono; **telefono
   facoltativo anche per «Telefono»** (bollino «manca il numero»); pulsanti per i prossimi 7 giorni; dopo il
   salvataggio un messaggio «✓ Segnata: Rossi, sab 20:30, 4 · Annulla» invece della schermata con «Fatto».
   Obiettivo: meno di 15 secondi.
4. **Avviso doppioni:** stesso numero, o stesso nome lo stesso giorno → «C'è già Rossi sabato alle 20:30 (4):
   è la stessa?».
5. **Contesto sopra i pulsanti** nella richiesta: «Alle 20:30 (±1 ora): 18 persone, 5 prenotazioni», senza le prove.
6. **Togliere «tavoli» dai totali** (una prenotazione da 10 su tre moduli contava «1 tavolo»): scrivere
   «5 prenotazioni · 18 persone».
7. **Avviso a chi deve mandare i WhatsApp:** oggi il telefono del locale non riceve nessuna notifica quando
   una risposta entra in «Da mandare su WhatsApp», e il pallino del menù non la conta.
8. **«Per stasera online fino alle…»** (es. 19:00): dopo, il modulo dice «chiamaci». Evita richieste in pieno servizio.
9. **Freno anti‑spam complessivo:** oltre 15 richieste in 10 minuti il modulo si mette in pausa da solo per
   30 minuti, mostra «chiamaci» e manda **una** notifica al titolare (senza Vercel Pro non c'è il firewall).
10. **Anteprime di prova sul database vero:** bloccare le azioni del personale nelle anteprime e fare le
    migrazioni solo nel rilascio vero (oggi anche un'anteprima le applica al database di produzione).
11. **Notifica al cliente che annulla:** spostarla dopo la risposta, con un tempo massimo (oggi un servizio
    di notifiche lento rallenta il suo «Annulla»).
12. **Ricarica della pagina ogni 60–90 secondi** invece di 30, per non consumare i limiti del piano gratuito.
13. **Iscrizione alle notifiche con chiave vecchia** (`device.tsx`): va rifatta se la chiave cambia;
    `VAPID_SUBJECT` vero (non quello di esempio).

**Email (sezione Mail)**
14. **Oggi la Mail spedisce anche se l'interruttore è spento** (chi apre l'indirizzo a mano può inviare, se le
    chiavi sono messe): bloccare pagina e invio quando è spenta e nelle anteprime.
15. **Quota condivisa:** newsletter e prenotazioni usano la stessa quota giornaliera (Resend gratis 100, Brevo
    gratis circa 300). Una newsletter grande farebbe fallire per tutta la giornata ricevute, conferme e avvisi.
    → Conteggio sul server degli invii del giorno, con una **riserva per le prenotazioni** (es. 50) e la
    scritta «ne puoi mandare ancora X oggi».
16. **Disiscrizioni vere:** oggi c'è solo «rispondi cancellami» e chi si cancella riceve di nuovo la mail
    ricaricando lo stesso Excel. → Elenco delle persone cancellate nel database, link «Non voglio più
    ricevere queste email» in ogni mail (funziona con un tocco), esclusione automatica al prossimo invio.
17. **Piè di pagina di legge** in ogni mail: nome del locale, ragione sociale, indirizzo, link all'informativa.
18. **Errori leggibili** («quota di oggi finita, riprova domani», «dominio non ancora verificato») invece di
    «Qualcosa è andato storto».
19. **Registro degli invii:** chi ha mandato cosa, quando, a quanti (titolare o consulente).

**Privacy**
20. Ragione sociale e partita IVA nell'informativa (oggi c'è un segnaposto).

Stima: circa **1,5–2 giorni di lavoro** per i punti 1–20, poi giro foto, prove e guida PDF (come chiede il progetto).

---

## 3. Cosa fai tu, fuori dal sito (prima di sabato)

| # | Cosa | Dove | Costo |
|---|---|---|---|
| 1 | **Brevo**: account, verifica del dominio langolodelvinoscandicci.com con i record **SPF, DKIM e DMARC** che indica Brevo (solo righe da aggiungere: **non** spostare il dominio né toccare la posta esistente), poi la chiave API | brevo.com + pannello del dominio | 0 € (≈300 al giorno) |
| 2 | **Una casella che leggete davvero** per le risposte dei clienti (`MAIL_REPLY_TO`) | – | 0 € |
| 3 | Variabili su Vercel, **solo Production**: `MAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `MAIL_FROM` (es. `L'Angolo del Vino <prenotazioni@langolodelvinoscandicci.com>`), `MAIL_REPLY_TO`, e le tre chiavi degli avvisi (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) — le chiavi le rigenero io, quelle preparate l'altra notte sono andate perse con il riavvio | vercel.com → Settings → Environment Variables | 0 € |
| 4 | **Alias per i clienti** (facoltativo): `angolodelvino.vercel.app` | Settings → Domains → Add | 0 € |
| 5 | Ragione sociale, partita IVA, email di contatto | a me | 0 € |
| 6 | **Telefono del locale**: meglio entrarci con un **dipendente «Locale»** che ha solo il permesso prenotazioni, non con l'account del titolare (altrimenti chi lo prende in mano vede ore, dipendenti e le loro password) | Dipendenti | 0 € |

**Mai** mettere `MAIL_PROVIDER=log` o `PUSH_PROVIDER=log` su Vercel: sono solo per le prove in locale
(fingono di aver spedito).

---

## 4. Decisioni che servono da te

1. **Sabato accendiamo tutto o solo l'agenda?** Consiglio: agenda + richieste online, **ma** chiudendo le
   richieste online per venerdì e sabato sera le prime due settimane (si impara nelle sere tranquille).
2. **Chi è il responsabile prenotazioni per sera** (solo lui ha le notifiche attive e il telefono del locale).
3. **Tablet fisso al banco** con l'agenda aperta, al posto del librone? (fortemente consigliato)
4. **Dal giorno X il librone va in pensione**: una sola fonte, sennò i conti non tornano.
5. **Consulente**: può accendere/spegnere, vedere i numeri dei clienti, ricevere notifiche, mandare la Mail
   da solo? Oggi può tutto come il titolare.
6. **Email promozionali**: a chi scrivere e con quale permesso. Gli indirizzi raccolti con le prenotazioni
   **non** si possono usare per le newsletter (l'informativa dice che non li usiamo per pubblicità, e la
   legge vuole un consenso separato). Per il futuro: una casella facoltativa «voglio ricevere le novità» nel
   modulo, con registro dei consensi.
7. **Quante email al giorno riservare alle prenotazioni** (consiglio 50 su 300 con Brevo).
8. **Regole del primo weekend**: anticipo minimo 2–3 ore, massimo 8 persone online, «per stasera online fino alle 19».

---

## 5. Sabato (solo configurazione, niente codice)

1. Controllo impostazioni e «Quante persone ci stanno».
2. Il responsabile entra da **orari-turni.vercel.app** (mai dall'alias), installa l'app, «Attiva gli avvisi»,
   «Questo è il telefono del locale», «Prova un avviso».
3. «Accendi», poi **prova completa in incognito** con il proprio numero per un giorno lontano: notifica, email,
   conferma, link al cliente, annullo. Poi «Cancella i dati di questa richiesta».
4. Permessi ai dipendenti che servono (solo quelli).
5. Link su Google (business.google.com → Prenotazione → Aggiungi link) e Instagram.
6. **Stampa del giorno** appesa al banco, ogni sera.
7. Spiegare al personale «Stasera siamo al completo» e «Spegni».

---

## 6. Dopo (nelle settimane successive)

- **Promemoria senza Vercel Pro:** sollecito «richiesta in attesa da 30 minuti» quando qualcuno apre il sito o
  un widget; riepilogo del mattino con il controllo giornaliero gratuito di Vercel; lista «Promemoria di
  domani» con i WhatsApp già scritti.
- **Vista «Stasera» unica e compatta** (coperti per fascia oraria in alto, una riga per prenotazione, richieste
  da confermare di stasera in giallo); schede da 6 a 4.
- **Vista settimanale** e stampa settimanale; esportazione in Excel.
- **Suggerimenti per gli abituali** (scrivendo il numero propone nome, persone, tavolo).
- **Riquadro «Problemi»** (email e notifiche non partite negli ultimi 7 giorni), perché senza Pro i log durano un'ora.
- **Backup del database** e prova di ripristino (oggi non c'è nessun backup nostro).
- Widget «Stasera» per la sala, «Annulla la serata» con i messaggi in coda, posti limitati per evento,
  ricerca storica oltre 30 giorni, inglese per i turisti, casella «novità» con consenso, mittente separato
  per le newsletter.

## 7. Da sapere

- **Vercel Hobby** è per uso non commerciale secondo le sue condizioni: vale per tutto il sito, non solo per
  le prenotazioni. Restando su Hobby: niente firewall personalizzato, controlli automatici al massimo una volta
  al giorno, log di circa un'ora, e se si superano i limiti mensili il sito si ferma invece di essere fatturato.
- **Il QR stampato** passa da qrco.de, un servizio a pagamento: se l'abbonamento scade, il QR dei tavoli smette
  di funzionare. Il QR non va mai cambiato.
- **Non cambiare mai `NEXTAUTH_SECRET`**: farebbe uscire tutti, renderebbe inutili i link già mandati ai
  clienti e bloccherebbe l'accesso dei dipendenti.
- **Guida PDF:** quando le prenotazioni si accendono va aggiornata (oggi dice «Prenota su WhatsApp»).
