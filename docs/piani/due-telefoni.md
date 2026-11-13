# Prenotazioni con due telefoni: il telefono del titolare e il telefono dell'enoteca

Analisi del 13 novembre 2026, fatta leggendo il codice così com'è dopo gli ultimi lavori sul
«Telefono enoteca» (versione 0.39.0 più le modifiche in corso, ultimo passaggio `4991372`).
Qui si descrive **quello che il sito fa davvero oggi**, non quello che vorremmo che facesse.
Dove il sito non basta ancora, è scritto chiaramente.

> **In una riga:** il telefono dell'enoteca è quello che risponde ai clienti, dal numero del
> locale (331 210 2464). Il telefono del titolare serve per decidere (confermare, proporre un
> orario, dire di no) e per tenere d'occhio la serata. Così il cliente parla sempre con un solo
> numero, e nessun messaggio parte due volte.

### Tre parole che useremo spesso

- **Avviso** (o «notifica»): il messaggio che compare sullo schermo del telefono anche quando è
  bloccato, come quando arriva un WhatsApp. Il sito ne manda uno quando succede qualcosa.
- **La lista «Da mandare su WhatsApp»** (la «coda»): l'elenco, uguale per tutti, dei messaggi
  già scritti che aspettano di essere mandati ai clienti. Chi ne manda uno lo toglie per tutti.
- **Il lucchetto**: quando qualcuno tocca il pulsante verde per mandare un messaggio, per 5 minuti
  quel messaggio è «suo». Gli altri vedono «In invio da Marta (telefono enoteca)…» e non possono
  mandarlo anche loro.

---

## 1. Chi entra con quale accesso

Ci sono quattro modi di entrare nella parte delle prenotazioni. Ognuno ha il suo accesso
(nome utente e password) e **non vanno mai scambiati**.

| Chi | Con quale accesso | Su quale apparecchio | Che cosa vede | Che cosa può fare |
|---|---|---|---|---|
| **Titolare** | Il suo account da titolare | Il suo telefono personale, il computer | Tutto il sito: orari, dipendenti, menù, mail, prenotazioni | Tutto, comprese le **Impostazioni** delle prenotazioni e «Chi manda i WhatsApp ai clienti» |
| **Consulente** | Il suo account (stessi poteri del titolare) | Il suo telefono o computer | Tutto, come il titolare | Tutto, come il titolare |
| **Telefono enoteca** | L'accesso condiviso «enoteca» (si crea da Dipendenti → «+ Telefono dell'enoteca») | Il telefono che resta in sala | **Solo Prenotazioni** (e il Menù solo se il titolare accende «Può modificare il menù») | Confermare, proporre un orario, dire di no, segnare tavoli e arrivi, **mandare i WhatsApp ai clienti dal numero del locale** |
| **Dipendente con il permesso** | Il suo accesso personale, con «Può gestire le prenotazioni» acceso | Il suo telefono | Le sue cose (orari, ore) e le prenotazioni | Confermare, proporre, dire di no, segnare in agenda. **Non manda WhatsApp ai clienti**: li mette nella lista e li manda il telefono enoteca |

### Il «Chi sei?» sul telefono enoteca

Il telefono della sala è uno solo, ma lo usano persone diverse. Per questo, la prima volta che si
apre Prenotazioni, il sito chiede **«Chi sei?»** e propone i nomi (prima chi è in turno oggi).
Da lì in poi, nella cronologia di ogni prenotazione si legge per esempio «Marta (telefono
enoteca)». La scelta vale **5 ore** (più o meno un turno), poi il sito la richiede.
Finché nessuno ha scelto il nome, **il telefono enoteca non salva niente**: compare «Prima scegli
chi sei: tocca «Chi sei?» in cima a Prenotazioni».

### Perché non si scambiano mai gli accessi

- **Il telefono della sala con l'accesso del titolare** è il rischio più grosso: chiunque lo
  prenda in mano vede e cambia orari, dipendenti (con le loro password), menù, impostazioni e mail.
- **L'accesso «enoteca» sul telefono personale di qualcuno** (titolare compreso): quel telefono
  diventa per il sito «il telefono enoteca». Riceve gli avvisi della sala e, quando si tocca il
  pulsante verde, il messaggio parte dal **WhatsApp di quel telefono**, cioè dal numero personale.
  E la cronologia scrive lo stesso «dal numero dell'enoteca»: **sbagliato, e nessuno se ne accorge**.
- **L'accesso personale di un dipendente sul telefono della sala**: il telefono smette di essere il
  telefono enoteca. Non può più mandare i WhatsApp ai clienti e gli avvisi «Da mandare su WhatsApp»
  smettono di arrivare in sala (vedi il caso nella sezione 4).
- **Uscire («Esci») dal telefono enoteca spegne i suoi avvisi.** È fatto apposta (il telefono
  potrebbe passare a un altro), ma vuol dire che dopo un «Esci» bisogna riaccenderli.

Per questo la regola è semplice: **sul telefono della sala si entra solo con «enoteca», e
l'accesso «enoteca» si usa solo lì**. La password la sa il titolare; non si dà ai dipendenti.

---

## 2. Gli avvisi: chi riceve che cosa

Ogni telefono riceve gli avvisi solo se su **quel** telefono qualcuno ha toccato «Attiva gli
avvisi» (in Prenotazioni, campanella → «Avvisi e WhatsApp su questo telefono»). Su iPhone gli
avvisi arrivano solo se il sito è installato sulla schermata Home e aperto da lì.

Oltre ai telefoni, si può scrivere un indirizzo email in **Impostazioni → «Email per gli avvisi»**:
riceve una copia di alcuni avvisi (vedi l'ultima colonna).

Come funziona oggi, con l'impostazione consigliata **«Solo il telefono enoteca»**:

| Che cosa succede | Telefono enoteca | Titolare e consulente | Dipendente con il permesso (suo telefono) | Email per gli avvisi |
|---|---|---|---|---|
| Arriva una **nuova richiesta** dal sito | ✅ | ✅ | ✅ | ✅ |
| Il cliente **annulla** dalla sua pagina | ✅ | ✅ | ✅ | ✅ |
| Il cliente **accetta o rifiuta l'orario proposto** dalla sua pagina | ✅ | ✅ | ✅ | ✅ |
| C'è un messaggio **«Da mandare su WhatsApp»** | ✅ | ❌ (lo vedono nella lista, ma il telefono non suona) | ❌ | ❌ |
| **Pausa automatica** (più di 15 richieste in 10 minuti: il modulo si chiude per 30 minuti) | ❌ | ✅ | ❌ | ✅ |
| «Prova un avviso» | solo il telefono che l'ha chiesto | | | |

Con l'altra impostazione, **«Anche titolare e consulente»**, l'unica riga che cambia è «Da mandare
su WhatsApp»: suona anche sui telefoni di titolare e consulente. E se il telefono enoteca non è
ancora stato creato, il sito fa comunque così (altrimenti non suonerebbe nessuno).

Due dettagli che contano:

- **Chi risponde e può mandare lui il WhatsApp non fa suonare gli altri.** Se dal telefono enoteca
  Marta conferma, il messaggio è già nelle sue mani: nessun avviso «Da mandare» agli altri.
  Se invece conferma il titolare con «Solo il telefono enoteca», suona il telefono della sala.
- In ogni prenotazione, nella cronologia, il sito scrive **a quanti telefoni è arrivato l'avviso**
  («Avviso a 3 telefoni», oppure «1 avviso non partito»). È il modo più semplice per controllare.

Le prenotazioni segnate a mano in agenda (telefonate, persone passate al banco) **non mandano
avvisi** a nessuno: chi le segna è già lì.

---

## 3. WhatsApp ai clienti: da quale numero partono

### La cosa da sapere prima di tutto

Il sito **non manda WhatsApp da solo**. Quando si tocca il pulsante verde, il sito apre il
**WhatsApp del telefono (o computer) che si ha in mano**, con il messaggio già scritto; poi
bisogna toccare Invia. Quindi il messaggio parte **dal numero di WhatsApp di quell'apparecchio**:

| Chi tocca il pulsante verde | Da quale numero parte |
|---|---|
| Telefono enoteca (WhatsApp Business del 331 210 2464) | **Dal numero del locale** ✅ |
| Titolare dal suo telefono, nella sua app WhatsApp Business | **Dal suo numero privato** ⚠️ (il cliente risponderà a lui) |
| Titolare da un computer o iPad collegato al numero del locale | **Dal numero del locale** ✅ |
| Dipendente dal suo telefono | Non può: il pulsante non c'è, il messaggio va nella lista per il telefono enoteca |

Da qualsiasi apparecchio che non sia il telefono enoteca, il sito scrive sotto il pulsante:
«Partirà dal tuo WhatsApp personale, non dal numero del locale: il cliente risponderà a te».

### La lista condivisa e il lucchetto

Tutte le risposte da mandare stanno in **una sola lista**, «Da mandare su WhatsApp», in cima alla
scheda delle cose da fare. Funziona così:

1. Chi tocca il pulsante verde **prende in mano** quel messaggio (il lucchetto, 5 minuti). Si apre
   WhatsApp con il testo pronto.
2. Gli altri, al posto del pulsante, leggono **«In invio da Marta (telefono enoteca) dalle 20:14…»**.
3. Dopo aver toccato Invia in WhatsApp, si torna sul sito e si tocca **«✓ Mandato»**: il messaggio
   sparisce dalla lista per tutti, e resta scritto «Mandato da Marta alle 20:15».
4. Se ci si ripensa, **«Annulla»** lo lascia libero per un altro.
5. Se nessuno tocca «Mandato» entro 5 minuti, il lucchetto si apre da solo.
6. Se qualcuno prova ad aprire un messaggio già mandato, il sito risponde **«Già mandato da Marta
   alle 20:15»** e WhatsApp non si apre. Solo toccando **«Rimanda lo stesso»** si può mandarlo di
   nuovo (per esempio se il cliente dice di non averlo ricevuto).
7. Se il messaggio è stato mandato in un altro modo (per esempio a voce), c'è «Segna come già mandata».

Mentre nella lista c'è qualcosa, la pagina controlla ogni 8 secondi se qualcuno ha preso o mandato
un messaggio, e si aggiorna da sola su tutti i telefoni.

### L'impostazione «Chi manda i WhatsApp ai clienti»

In Prenotazioni → **Impostazioni** (la vedono e la cambiano solo titolare e consulente):

- **«Solo il telefono enoteca (consigliato)»**: i messaggi li manda la sala. Titolare e consulente
  li vedono nella lista e, se serve davvero, possono mandarne uno toccando **«Mandalo io»** /
  **«Mandalo io dal mio WhatsApp»**: il sito chiede prima «Mandarlo tu dal tuo WhatsApp?» e ricorda
  che il cliente risponderà a loro.
- **«Anche titolare e consulente»**: il primo che tocca il pulsante verde lo prende, gli altri
  vedono «In invio da…». Il telefono del titolare suona anche per i messaggi da mandare.

### Come può il titolare scrivere dal numero del locale anche fuori dalla sala

WhatsApp Business permette di usare **lo stesso numero (331 210 2464) su altri apparecchi, fino a
4**, senza spegnerlo sul telefono della sala. Si fa dal telefono della sala: WhatsApp Business →
**Impostazioni → Dispositivi collegati → Collega un dispositivo**, e si inquadra il codice QR che
compare sull'altro apparecchio.

Il titolare usa già WhatsApp Business con il suo numero privato, quindi sul suo telefono le
possibilità sono queste, dalla più sicura:

1. **Computer o iPad collegato (consigliato).** Sul Mac o sull'iPad si apre WhatsApp (l'app o
   web.whatsapp.com) e lo si collega al 331 con il QR. Quando dal sito si tocca il pulsante verde,
   si apre lì, e il messaggio parte dal numero del locale. Attenzione: se sul Mac WhatsApp è già
   collegato al suo numero privato, per il locale serve un'altra finestra (per esempio
   web.whatsapp.com in un altro browser).
2. **«Aggiungi account» dentro WhatsApp Business sul suo telefono**, **solo se** propone di
   collegarsi con il codice QR. **Se chiede il numero e un codice via SMS, fermatevi**: vorrebbe dire
   spostare il numero del locale sul telefono del titolare, e **il telefono della sala verrebbe
   scollegato** da WhatsApp.
3. **L'app WhatsApp normale (quella verde senza la «B»)**, se sul suo telefono non la usa per
   altro: all'avvio si sceglie di collegarla a un account esistente con il QR (stessa regola: se
   chiede l'SMS, ci si ferma).

**Attenzione all'iPhone con due app WhatsApp.** Se sullo stesso iPhone ci sono sia WhatsApp sia
WhatsApp Business, quando il sito apre WhatsApp è l'iPhone a scegliere quale app aprire, e non
sempre quella giusta. Prima di usarlo con i clienti, provate (passo 8 della sezione 6) e guardate
**in alto nella chat da quale account state scrivendo**. Sappiate anche che il sito, nella
cronologia, scrive «dal WhatsApp personale» per tutto quello che parte dal telefono del titolare,
anche se in realtà è partito dal numero del locale collegato: lo deduce dall'accesso, non dal numero.

Due note su WhatsApp Business:
- gli apparecchi collegati restano attivi solo se **il telefono della sala si collega a internet
  almeno una volta ogni 14 giorni** (d'estate, in chiusura, ricordarsene);
- conviene accendere **Impostazioni → Account → Verifica in due passaggi** (un PIN di 6 cifre): se il
  telefono viene rubato, nessuno può spostare il numero del locale su un altro telefono senza il PIN.

---

## 4. I casi difficili

### 4.1 Il titolare conferma da casa mentre in sala qualcuno sta già rispondendo

- **Oggi:** non succede niente di grave. Il sito accetta solo la prima risposta: chi arriva secondo
  legge «Già confermata da Andrea» (o «Già gestita da Marta (telefono enoteca): è stato proposto un
  altro orario») e la pagina si aggiorna. Il cliente non riceve due risposte diverse.
- **Con la versione nuova (telefono enoteca + «Solo il telefono enoteca»):** se conferma il
  titolare, il messaggio finisce nella lista e **suona il telefono della sala**, che lo manda dal 331.
  Il titolare non deve fare altro.
- **Resta da decidere:** chi risponde alle richieste durante il servizio. Il sito non mostra «Marta
  sta guardando questa richiesta» (il lucchetto c'è solo per il WhatsApp): due persone possono
  perdere tempo sulla stessa richiesta. Consiglio: **durante il servizio risponde la sala; il titolare
  interviene sulle richieste ferme da più di 15–20 minuti.**

### 4.2 Lo stesso cliente riceve due messaggi

- **Oggi:** il lucchetto e «Già mandato da…» lo evitano quasi sempre. Il buco rimasto: chi manda il
  messaggio e **si dimentica di toccare «✓ Mandato»**. Dopo 5 minuti il lucchetto si apre, il
  messaggio torna nella lista e un altro può mandarlo di nuovo.
- **Con la versione nuova:** stesso comportamento; con un solo telefono che manda, il rischio quasi
  sparisce (chi riapre vede che in WhatsApp il messaggio è già partito).
- **Resta da decidere:** l'abitudine «Invia → torna sul sito → ✓ Mandato» va insegnata a tutti.

### 4.3 Il telefono dell'enoteca è scarico o spento

- **Oggi:** gli avvisi delle **nuove richieste** arrivano comunque a titolare, consulente, dipendenti
  con il permesso e all'email. Ma con «Solo il telefono enoteca» gli avvisi **«Da mandare su
  WhatsApp»** vanno **solo** al telefono della sala: se è spento, **nessun telefono suona**. Il
  messaggio non si perde: resta nella lista e nel pallino di Prenotazioni, e il titolare lo vede
  con «Mandalo io». Quando il telefono si riaccende riceve gli avvisi arretrati (fino a 6 ore).
  Niente resta bloccato per sempre: un messaggio il cui orario è passato esce da solo dalla lista.
- **Con la versione nuova:** il sito non si accorge che il telefono della sala è spento.
- **Resta da decidere:** un **promemoria al titolare** se un messaggio aspetta da più di N minuti
  (decisione 3). Nel frattempo, regola: telefono della sala **sempre in carica al banco**.

### 4.4 Il telefono si perde o viene rubato

- **Oggi:** in Dipendenti, nella scheda del telefono enoteca, **«Nuova password»**: il vecchio accesso
  smette subito di funzionare. **Ma attenzione:** cambiare la password **non ferma gli avvisi**. Il
  telefono perso continua a ricevere sullo schermo bloccato «Nuova richiesta… Rossi, 4 persone…».
  Per fermarli davvero oggi bisogna **eliminare il telefono** («Elimina il telefono», le prenotazioni
  restano) e crearne uno nuovo con «+ Telefono dell'enoteca». Per il telefono personale del titolare
  oggi **non c'è un modo** dal sito per staccare gli avvisi da lontano.
  Per WhatsApp: con la SIM nuova (dal gestore) si riattiva il 331 su un altro telefono; da lì si
  scollegano i dispositivi collegati.
- **Con la versione nuova:** uguale.
- **Resta da decidere:** che «Nuova password» spenga anche gli avvisi di quell'accesso (piccola
  modifica, decisione 5). Subito, su tutti e due i telefoni: **codice di sblocco** e anteprime degli
  avvisi **solo a telefono sbloccato**.

### 4.5 Un cliente risponde al WhatsApp sbagliato

- **Oggi:** il cliente risponde al numero da cui ha ricevuto il messaggio. Se il titolare ha mandato
  dal suo numero privato, la risposta arriva **solo a lui**, e in sala nessuno la vede. Succede
  soprattutto con l'orario proposto, perché il messaggio dice «Rispondi pure qui con «sì» o «no»».
  In quel caso chi riceve la risposta deve segnarla sul sito («il cliente ha detto sì / no»).
- **Con la versione nuova:** se tutti i messaggi partono dal 331 (sala o apparecchi collegati), le
  risposte arrivano in un posto solo, visibile da tutti gli apparecchi collegati.
- **Resta da decidere:** se nel messaggio dell'orario proposto chiedere di rispondere **dalla pagina**
  (un tocco su «Va bene»), che aggiorna il sito da sola, invece che su WhatsApp.

### 4.6 Un dipendente entra con il suo accesso personale sul telefono dell'enoteca

- **Oggi:** il telefono della sala diventa «il telefono di Marta»: niente pulsante verde per i clienti
  («Le risposte su WhatsApp le manda il telefono enoteca»), e i suoi avvisi passano a lei, quindi
  **gli avvisi «Da mandare su WhatsApp» non suonano più in sala**. Quando lei esce, gli avvisi su quel
  telefono si spengono del tutto finché qualcuno non rientra con «enoteca» e li riattiva.
- **Con la versione nuova:** non c'è motivo di farlo: con «Chi sei?» il suo nome compare lo stesso.
- **Resta da decidere:** niente; basta la regola «sul telefono della sala solo enoteca», detta a tutti.

### 4.7 Il titolare è in ferie

- **Oggi:** il suo telefono continua a ricevere tutte le nuove richieste e, con «Solo il telefono
  enoteca», non i messaggi da mandare. Non c'è un «non disturbare fino al…»: può solo toccare
  **«Disattiva»** negli avvisi del suo telefono e riattivarli al ritorno. L'email per gli avvisi
  continua ad arrivare. Le Impostazioni le può cambiare anche il consulente.
- **Con la versione nuova:** la sala lavora da sola: risponde, manda i WhatsApp dal 331.
- **Resta da decidere:** chi tiene d'occhio le richieste ferme quando il titolare non c'è
  (il consulente? un responsabile di sala?) — decisione 4.

### 4.8 Due persone toccano lo stesso WhatsApp nello stesso secondo

- **Oggi:** il sito ne fa passare **una sola**: il database decide chi è arrivato primo, l'altro legge
  subito «In invio da …» e la sua finestra di WhatsApp si richiude. **Eccezione:** il lucchetto
  riconosce le persone dal **nome**, non dal telefono. Se lo stesso nome è usato su due apparecchi
  insieme (il titolare dal telefono e dal computer; oppure due telefoni enoteca con la stessa persona
  scelta in «Chi sei?»), tutti e due possono aprirlo.
- **Con la versione nuova:** con un solo telefono enoteca il caso praticamente non esiste.
- **Resta da decidere:** niente per domani; se un giorno ci saranno due telefoni in sala, ognuno
  scelga il proprio nome.

### 4.9 Avvisi spenti su uno dei telefoni

- **Oggi:** se sul telefono si tolgono i permessi delle notifiche, il sito se ne accorge solo al
  prossimo avviso e smette di mandarglieli (nella cronologia: «1 avviso non partito»). Nessuno viene
  avvisato. Anche le modalità «Non disturbare» / «Full immersion» dell'iPhone possono zittire il sito
  senza che si veda.
- **Con la versione nuova:** uguale. Sul telefono stesso, nel riquadro «Avvisi su questo telefono»,
  si vede se sono attivi («✓ Avvisi attivi su questo telefono») e c'è «Prova un avviso».
- **Resta da decidere:** un elenco, per il titolare, dei telefoni che ricevono gli avvisi e
  dell'ultimo avviso arrivato (il sito questa informazione la salva già, ma non la mostra).

### 4.10 Un telefono nuovo al posto di quello della sala

- **Oggi:** sul telefono nuovo si entra con «enoteca» (la password è nella scheda del telefono in
  Dipendenti), lo si mette sulla schermata Home, si riattivano gli avvisi e si prova. Sul telefono
  vecchio si tocca **«Esci»** (così smette di ricevere gli avvisi). Per WhatsApp Business: si sposta
  il 331 sul telefono nuovo (con la SIM, o con il trasferimento della chat di WhatsApp) e poi si
  ricollegano computer e iPad.
- **Con la versione nuova:** uguale.
- **Resta da decidere:** niente; usare la lista di passi della sezione 6.

### In breve: le cose che il sito oggi non fa

Per chi lavora sul codice, in ordine di importanza:

| # | Che cosa manca | Dove |
|---|---|---|
| 1 | Cambiare password **non spegne gli avvisi**: un telefono perso continua a ricevere nomi e orari dei clienti | `src/lib/booking/push.ts` (`recipients`), cambio password in `src/app/(app)/dipendenti/actions.ts` e nell'account del titolare |
| 2 | Con «Solo il telefono enoteca», se la sala non manda, **nessun promemoria** al titolare | `src/lib/booking/push.ts`, `notifyWhatsappQueue` in `src/lib/booking/service.ts` |
| 3 | Nessun elenco dei telefoni iscritti agli avvisi (chi, quando ha ricevuto l'ultimo, «Togli») | `PushSubscription.lastOkAt` c'è già in `prisma/schema.prisma` |
| 4 | Con «Anche titolare e consulente», se il titolare conferma, la sala non riceve l'avviso: se lui poi non manda, il messaggio aspetta in silenzio | `respond()` e `selfWa` in `src/lib/booking/service.ts` |
| 5 | «Da dove è partito» si deduce dall'accesso, non dal numero vero | `sentFrom` in `src/lib/booking/venue.ts` |
| 6 | Il lucchetto riconosce il nome, non l'apparecchio | `claimWhatsapp` in `src/lib/booking/service.ts` |

---

## 5. Decisioni da prendere insieme

**1. Chi manda i WhatsApp ai clienti?**
- A) Solo il telefono enoteca; il titolare solo in emergenza con «Mandalo io».
- B) Anche titolare e consulente, il primo che arriva.
- **Consiglio: A.** Il cliente vede sempre lo stesso numero, risponde sempre allo stesso numero, e la
  sala ha tutta la conversazione davanti. È già l'impostazione predefinita del sito.

**2. Come scrive il titolare ai clienti quando non è in sala?**
- A) Da un computer o iPad collegato al 331.
- B) Dal suo telefono, con un secondo account WhatsApp collegato con il QR.
- C) Dal suo numero privato.
- **Consiglio: A**, e B solo dopo una prova fatta bene (passo 8). **Mai C**, se non in emergenza:
  il cliente si salva il numero privato del titolare e da lì in poi scrive a lui.

**3. Se un messaggio resta nella lista troppo a lungo, chi viene avvisato?**
- A) Nessuno, come oggi: lo si vede nel pallino e nella lista.
- B) Dopo 15 minuti (solo con il locale aperto), un avviso anche al titolare: «Da 15 minuti c'è un
  WhatsApp da mandare a Rossi: il telefono della sala è acceso?».
- **Consiglio: B.** È la rete di sicurezza per il telefono scarico. Richiede una piccola modifica.

**4. Chi è il responsabile delle prenotazioni quando il titolare non c'è?**
- A) Il consulente, da remoto.
- B) Chi apre il locale quel giorno, dal telefono della sala.
- **Consiglio: B per il servizio, A come riserva.** Scriverlo in un posto visibile, per ogni giorno.

**5. Che cosa succede quando si cambia una password?**
- A) Come oggi: l'accesso si chiude, ma gli avvisi continuano ad arrivare.
- B) Con la nuova password si spengono anche tutti gli avvisi di quell'accesso; ogni telefono buono
  li riaccende con un tocco.
- **Consiglio: B.** Sono dati dei clienti sullo schermo di un telefono che non è più nostro.

**6. Il titolare in ferie o nei giorni liberi**
- A) Tocca «Disattiva» sugli avvisi del suo telefono e li riattiva al ritorno (si può già fare).
- B) Un interruttore «Pausa avvisi fino al…» nel riquadro avvisi (da costruire).
- **Consiglio: A per ora**, tenendo l'email per gli avvisi accesa come riserva. B solo se A si
  dimentica spesso.

---

## 6. Passi pratici per domani

**Il titolare, dal suo telefono o dal computer:**

1. **Dipendenti → «+ Telefono dell'enoteca»** (se non c'è già). Tenere a portata di mano nome utente e
   password che compaiono in «Come collegarlo».
2. **Prenotazioni → Impostazioni → «Chi manda i WhatsApp ai clienti» → «Solo il telefono enoteca
   (consigliato)» → Salva.**
3. In Impostazioni, controllare che l'**«Email per gli avvisi»** sia quella giusta (è la riserva se un
   telefono tace).
4. Sul **suo** telefono: Prenotazioni → campanella → **«Attiva gli avvisi»** → «Prova un avviso».

**Sul telefono dell'enoteca (lo fa il titolare, non si dà la password a nessuno):**

5. Aprire **orari-turni.vercel.app**, entrare con l'accesso «enoteca», aggiungere il sito alla
   schermata Home (su iPhone: Condividi → «Aggiungi alla schermata Home») e **aprirlo dall'icona**.
6. Prenotazioni → **«Chi sei?»** → un nome; poi campanella → **«Attiva gli avvisi»** → **«Prova un
   avviso»**. Deve arrivare entro pochi secondi.
7. Nelle impostazioni del telefono: **codice di sblocco**, anteprime degli avvisi **«Se sbloccato»**,
   nessuna modalità «Non disturbare» o «Full immersion» durante il servizio, volume alto. In WhatsApp
   Business: **Verifica in due passaggi** accesa.

**Insieme, una prova vera (le prenotazioni online devono essere accese, altrimenti le prove non
fanno suonare nessuno):**

8. Da un vostro cellulare, chiedere un tavolo dal sito. Controllare che suonino **tutti e due** i
   telefoni. Il titolare conferma dal suo telefono → deve suonare **solo** il telefono della sala con
   «Da mandare su WhatsApp». In sala: pulsante verde → WhatsApp si apre **sul 331** → Invia →
   **«✓ Mandato»**. Sul telefono del titolare la riga deve diventare «Mandato da … alle …».
   Poi, dal telefono del titolare, provare «Mandalo io» sulla stessa prenotazione e guardare **quale
   WhatsApp si apre** (e che il sito dica «Già mandato da…»). Alla fine annullare la prova.
9. Collegare il **computer del titolare** al 331 (WhatsApp Business in sala → Impostazioni →
   Dispositivi collegati → Collega un dispositivo → QR).

**La regola per tutti, da dire al personale domani:**

10. **Il telefono della sala resta in carica al banco. Si entra solo con «enoteca». Ogni turno si
    sceglie «Chi sei?». Dopo Invia su WhatsApp, si torna sul sito e si tocca «✓ Mandato».**

---

## Revisione dell'esperienza del cliente

Ho riletto il percorso del cliente (`src/app/(public)/menu/prenota/`): modulo, invio, pagina «La tua
richiesta». È curato e chiaro; qui sotto le cose che migliorerei, dalla più utile. Nessuna è stata
modificata.

1. **Dire al cliente da quale numero gli scriveremo.** Oggi il modulo dice «Ti rispondiamo su
   WhatsApp a questo numero» e la pagina «ti rispondiamo su WhatsApp al 333…», ma non dice **da
   quale** numero. Un messaggio da un numero sconosciuto si ignora, o peggio si segnala come spam
   (e WhatsApp può limitare il numero del locale). Aggiungere «Ti scriviamo dal 331 210 2464 —
   L'Angolo del Vino: salvalo in rubrica». File: `booking-form.tsx` (riga 518, il suggerimento del
   telefono) e `r/[token]/page.tsx` (riga 56, `replyBy`).
2. **Chi sceglie WhatsApp non riceve nessuna ricevuta.** Chi sceglie l'email riceve subito «Richiesta
   ricevuta»; chi sceglie WhatsApp no (il testo «received» in `src/lib/booking/messages.ts` si usa
   solo per le email). Se chiude la pagina senza salvarla, perde il link. Proposta: nella pagina
   «Richiesta inviata» un pulsante ben visibile **«Mandaci il codice su WhatsApp»** (il messaggio già
   pronto esiste: `r/[token]/page.tsx`, riga 51), così la chat parte dal cliente, sul numero del
   locale, e il link resta nel suo WhatsApp. Oggi quel pulsante c'è solo in fondo, sotto «Hai una
   domanda?» (riga 230).
3. **Rispondere all'orario proposto dalla pagina, non su WhatsApp.** Il messaggio «Ti va bene alle…?»
   dice «Rispondi pure qui con «sì» o «no»» (`messages.ts`, riga 39). Ogni risposta su WhatsApp va
   poi segnata a mano, e se il messaggio è partito da un numero privato si perde (caso 4.5). Meglio:
   «Tocca qui per dire sì o no: {link}», lasciando WhatsApp come seconda strada.
4. **Dire quanto si aspetta.** «Ti rispondiamo noi» non dice quando. Una riga tipo «Di solito
   rispondiamo entro un'ora, negli orari di apertura» (o, se il locale è chiuso, «ti rispondiamo
   domani dalle 17») toglie ansia e telefonate. File: `page.tsx` (riga 115) e la pagina della
   richiesta (`r/[token]/page.tsx`, testo «Da confermare»).
5. **Chi non ha WhatsApp.** Se le email non sono attive, l'unica risposta possibile è WhatsApp:
   chi ha un cellulare senza WhatsApp non riceve niente. Aggiungere una terza scelta «Chiamatemi»
   in «Come preferisci la risposta?» (`booking-form.tsx`, riga 523), che in sala diventa «da
   chiamare».
6. **Il codice della richiesta in primo piano.** Il codice è in fondo al riquadro dei dettagli.
   Chi chiama il locale se lo deve cercare. Metterlo anche sotto il titolo «Richiesta inviata»
   (`r/[token]/page.tsx`).
7. **«Salva o manda il link» è piccolo e in basso.** Per chi sceglie WhatsApp è l'unico modo di
   ritrovare la richiesta. Renderlo un pulsante vero, subito dopo il testo principale
   (`r/[token]/status-actions.tsx`, `SaveLink`).
8. **La casella della privacy.** Per chiedere un tavolo non serve un consenso (i dati servono a
   rispondere alla richiesta): basterebbe una frase «Inviando accetti l'informativa sulla privacy»,
   un passaggio in meno. È una scelta da verificare con chi segue la privacy (`booking-form.tsx`,
   riga 600).

---

## Aggiornamento del 14 novembre 2026: che cosa è stato sistemato

- **#1 Password e avvisi:** una password nuova (scritta o generata), un accesso disattivato o eliminato,
  e il cambio password del titolare o del consulente **spengono gli avvisi** di quell'accesso. I telefoni
  buoni li riaccendono con «Attiva gli avvisi».
- **#3 Elenco dei telefoni:** Prenotazioni → ⋯ → Impostazioni → **«Telefoni che ricevono gli avvisi»**:
  chi, che apparecchio (iPhone, Android, Computer…), quando è arrivato l'ultimo avviso, e «Togli».
  Solo titolare e consulente.
- **#2 Promemoria:** con «Solo il telefono enoteca», se un messaggio resta da mandare per **15 minuti**,
  parte **un solo** avviso a titolare e consulente («Da 15 minuti c'è un messaggio WhatsApp da mandare a
  Rossi: il telefono dell'enoteca è acceso?»). Il controllo parte quando si apre Prenotazioni, mentre la
  pagina controlla la lista e quando arriva una richiesta (su Vercel Hobby non c'è un controllo ogni
  minuto): se nessuno apre il sito, il promemoria arriva al primo controllo utile.
- **#6 Lucchetto:** riconosce anche l'apparecchio (un numero a caso tenuto sul dispositivo): lo stesso
  nome su due apparecchi non prende due volte lo stesso messaggio («In invio da Andrea su un altro
  apparecchio»).
- **Cliente, punto 1:** modulo e pagina della richiesta dicono «Ti scriviamo dal numero WhatsApp
  dell'enoteca, 331 210 2464: salvalo in rubrica» (il numero viene dai contatti del menù). Anche le
  email delle prenotazioni lo dicono.
- **Cliente, punti 2 e 6:** nella pagina della richiesta il codice è anche in alto, e per chi ha scelto
  WhatsApp c'è «Mandaci il codice su WhatsApp» subito sotto.

Restano da decidere: #4 (con «Anche titolare e consulente» la sala non suona se conferma il titolare),
#5 («da dove è partito» dedotto dall'accesso) e i punti 3, 4, 5, 7 e 8 della revisione del cliente.
