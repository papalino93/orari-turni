# Invio mail alla mailing list (`/mail`)

Una stessa mail a tutti, con l'intestazione (saluto) diversa per ogni destinatario.
Una mail per persona, mai tutti in copia. Provider: [Resend](https://resend.com),
dietro l'interfaccia `MailProvider` in `src/lib/mail.ts` (per passare a Brevo o SES
basta un secondo adattatore).

## Variabili d'ambiente (Vercel → Settings → Environment Variables)

| Variabile | Obbligatoria | Note |
|---|---|---|
| `MAIL_PROVIDER` | no | `resend` (predefinito) o `brevo` |
| `RESEND_API_KEY` | con Resend | Chiave API di Resend |
| `BREVO_API_KEY` | con Brevo | Chiave API v3 di Brevo (SMTP & API → API Keys) |
| `MAIL_FROM` | sì | `L'Angolo del Vino <info@langolodelvinoscandicci.com>` |
| `MAIL_REPLY_TO` | consigliata | Dove arrivano le risposte e i «cancellami» |
| `MAIL_DAILY_LIMIT` | no | Default 100 con Resend, 300 con Brevo (piani gratuiti) |

## Dominio mittente

Per scrivere da info@langolodelvinoscandicci.com il dominio langolodelvinoscandicci.com va verificato su Resend aggiungendo i record
DNS (SPF e DKIM) che il pannello mostra; senza, Resend permette solo la modalità di
prova (mittente `onboarding@resend.dev`, destinatario solo il tuo indirizzo).
Senza SPF/DKIM le mail finiscono in spam.

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

## Limiti noti

- Non c'è un elenco delle disiscrizioni: il piè di pagina chiede di rispondere «cancellami»
  e va tolto a mano dal file. Con liste più grandi conviene salvare le disiscrizioni nel database.
- Nessuno storico degli invii.

## Brevo

Si attiva con `MAIL_PROVIDER=brevo` e `BREVO_API_KEY`. Il mittente (`MAIL_FROM`) va verificato su Brevo
(Senders, domains & dedicated IPs): per il dominio servono i record DNS che Brevo mostra, diversi da
quelli di Resend. Se su Brevo è attiva la lista di IP autorizzati, va disattivata: Vercel non ha un
IP fisso. Brevo spedisce una richiesta per destinatario.
