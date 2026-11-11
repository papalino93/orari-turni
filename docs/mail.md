# Invio mail alla mailing list (`/mail`)

Una stessa mail a tutti, con l'intestazione (saluto) diversa per ogni destinatario.
Una mail per persona, mai tutti in copia. La sezione la vedono e la usano **solo titolare e
consulente** (account User): i dipendenti non la aprono mai (Proxy + `requireUser` in ogni azione).

Codice: `src/lib/mail-text.ts` (lettura della lista, testo, piè di pagina: usato anche dal browser
per l'anteprima), `src/lib/mail.ts` (servizio di posta, quota, disiscrizioni, dati del mittente),
`src/app/(app)/mail/**` (pagina e azioni), `src/app/(public)/mail/cancellami/**` (pagina pubblica
per non ricevere più le email).

## Quando si può spedire

- Interruttore **Impostazioni → «Mail»** acceso. Spento, `/mail` rimanda a Impostazioni con una
  frase che spiega perché, e ogni azione di invio rifiuta (anche chi aveva la pagina già aperta).
- Mai dalle **anteprime di Vercel** (`VERCEL_ENV=preview`, che usano il database vero): la pagina si
  apre ma dice «nelle versioni di prova non si spedisce» e le azioni rifiutano.
- Servizio collegato (chiave + `MAIL_FROM`).

## Servizio consigliato: Brevo

Piano gratuito: circa **300 mail al giorno**, condivise tra prenotazioni e invii dalla pagina Mail.

1. Account su brevo.com.
2. **Senders, domains & dedicated IPs → Domains → Add a domain**: `langolodelvinoscandicci.com`.
   Brevo mostra i record DNS da **aggiungere** nel pannello del dominio (non si sposta il dominio e non
   si tocca la posta esistente):
   - **SPF** (TXT sulla radice): se esiste già un `v=spf1 …`, si aggiunge `include:spf.brevo.com`
     dentro lo stesso record (mai due record SPF);
   - **DKIM** (il record che indica Brevo, di solito `brevo._domainkey` / `mail._domainkey`);
   - **codice di verifica Brevo** (TXT `brevo-code:…`);
   - **DMARC** (TXT su `_dmarc`), per cominciare `v=DMARC1; p=none; rua=mailto:<una casella vostra>`.
   Poi «Verify»: finché il dominio non è verificato le mail non partono (la pagina lo dice).
3. **SMTP & API → API Keys → Generate**: è `BREVO_API_KEY`.
4. Se in Brevo è attiva la lista di **IP autorizzati** (Security → Authorised IPs), va disattivata:
   Vercel non ha un IP fisso (la pagina lo dice, se succede).

Con Resend (`MAIL_PROVIDER=resend`) i passi sono gli stessi sul suo pannello (Domains); il piano
gratuito è di 100 al giorno.

## Variabili d'ambiente (Vercel → Settings → Environment Variables, solo **Production**)

| Variabile | Obbligatoria | Note |
|---|---|---|
| `MAIL_PROVIDER` | sì | `brevo` (consigliato) o `resend`. **Mai `log` su Vercel**: finge di spedire (solo prove in locale) |
| `BREVO_API_KEY` | con Brevo | Chiave API v3 di Brevo |
| `RESEND_API_KEY` | con Resend | Chiave API di Resend |
| `MAIL_FROM` | sì | `L'Angolo del Vino <prenotazioni@langolodelvinoscandicci.com>` (dominio verificato) |
| `MAIL_REPLY_TO` | consigliata | Una casella letta davvero: risposte, «cancellami», richieste privacy |
| `MAIL_DAILY_LIMIT` | no | Mail al giorno del piano. Predefinito 300 con Brevo, 100 con Resend |
| `MAIL_BOOKING_RESERVE` | no | Mail del giorno tenute per le prenotazioni. Predefinito 50 |
| `MAIL_COMPANY`, `MAIL_VAT` | no | Ragione sociale e P. IVA iniziali; meglio scriverle nel riquadro «Dati del mittente» della pagina |
| `NEXTAUTH_SECRET` | già c'è | Firma i link per cancellarsi: **non cambiarla mai** (i link già mandati smetterebbero di funzionare) |

## Quota condivisa e riserva per le prenotazioni

Il servizio ha **una sola** quota al giorno per tutto: ricevute, conferme e avvisi delle prenotazioni
e invii dalla pagina Mail. Il sito conta sul server gli invii del giorno (ora di Roma, tabella
`MailDay`: `transactional` = prenotazioni, `bulk` = pagina Mail, prove comprese).

- Gli invii dalla pagina Mail non possono superare `limite − riserva − già usate oggi`: la pagina scrive
  «Oggi puoi mandare ancora X mail (Y sono tenute per le prenotazioni)» e l'azione rifiuta sul server
  il gruppo che sforerebbe (il conteggio è atomico: due invii insieme non passano il limite).
- Le prenotazioni possono usare tutto il limite. Per contarle si usano `sendTransactional(mails)`
  oppure `recordMailSent("transactional", n)` di `src/lib/mail.ts`; `mailQuotaToday()` dà
  `{ limit, used, reserve, bulkAvailable }`.
- Se il servizio dice comunque «quota finita» (429/402), l'invio si ferma e la pagina scrive «La quota
  di oggi è finita: riprova domani».

## Registro degli invii

Ogni invio dalla pagina è una riga in `MailSend` (chi, oggetto, destinatari, partite, non partite,
escluse, esito) e la pagina mostra gli **ultimi 20** in «Invii recenti». La lista parte a gruppi da 50
(`MailSendChunk`, chiave invio + numero del gruppo): se la connessione cade, **«Riprova»** riparte da
dove si era fermato e il server non rispedisce un gruppo già partito. La prova su di sé conta sulla
quota ma non va nel registro.

## Disiscrizioni

- In fondo a ogni mail c'è «Non voglio più ricevere queste email»: porta a
  `/mail/cancellami/<link firmato>` (pubblica, senza accesso, non indicizzata, mai in cache), che chiede
  «Vuoi smettere di ricevere le email dell'Angolo del Vino?» → **Sì, cancellami** → «Fatto».
- Intestazioni `List-Unsubscribe` (link + `mailto:` a `MAIL_REPLY_TO`) e
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click`: Gmail, Apple Mail ecc. mostrano «Annulla
  iscrizione» e mandano un POST a `/mail/cancellami/<link>/conferma` (accettato senza pagina, come
  vuole la RFC 8058). Il pulsante della pagina accetta solo POST dal sito stesso.
- Gli indirizzi cancellati sono in `MailOptOut` (minuscolo, con data e modo). Al passo 1 vengono tolti
  da soli («N indirizzi esclusi perché si sono cancellati») e il server li esclude comunque.
- Chi risponde «cancellami»: riquadro **«Segna come cancellato»** nella pagina.

## Piè di pagina di legge

Ogni mail della lista finisce con: nome del locale e indirizzo (da Gestione menù → contatti), ragione
sociale e partita IVA (riquadro «Dati del mittente» della pagina, salvato in MenuSetting
`mailSender`), «Ricevi questa email perché…», link all'informativa (quello scritto nei Dati del
mittente, altrimenti la sezione «I tuoi dati» della pagina di disiscrizione) e il link per cancellarsi.
Un'unica funzione (`mailFooter` in `mail-text.ts`) fa sia la mail sia l'anteprima.

Attenzione: gli indirizzi raccolti con le prenotazioni **non** si usano per le newsletter (serve un
consenso separato).

## Errori

I rifiuti del servizio diventano frasi chiare: quota finita, troppe in pochi secondi, chiave non
valida, dominio non verificato, mittente non valido, IP non autorizzato. Con Brevo ogni destinatario è
una richiesta a sé, quindi «Sono partite N su M» conta davvero quelle partite.

## File Excel (.xlsx)

Il file si sceglie con il pulsante «Scegli il file» oppure si **trascina** sul riquadro (o su tutta la scheda «A chi vuoi scrivere?»); un file di tipo sbagliato o più file insieme danno un avviso.

Si può caricare direttamente il file «Aziende Natale» (primo foglio): la riga dei titoli è
quella con la colonna «Email…». La pagina chiede quale colonna contiene l'intestazione (di solito «Azienda / studio»), il filtro per priorità e, di default, esclude le
righe il cui «Presupposto invio» è vuoto o «Da verificare».

## Formato CSV

Due colonne, con o senza riga di titoli, separatore `,` `;` o tabulazione:

```
email;intestazione
mario@esempio.it;Dott. Rossi
```

Indirizzi non validi e doppioni vengono scartati. Nel file va solo la parte di ognuno; il saluto uguale per
tutti si scrive nel testo con il segnaposto `{intestazione}` (es. «Spett.le {intestazione},»).

## Prove

`scripts/menu-e2e/mail-quota.mjs` e `mail-drop.mjs`, con il server di prova avviato con
`MAIL_PROVIDER=log` (un indirizzo `…+errore@…` finge un rifiuto). Le prove lasciano la sezione Mail spenta.
