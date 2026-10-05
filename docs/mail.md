# Invio mail alla mailing list (`/mail`)

Una stessa mail a tutti, con l'intestazione (saluto) diversa per ogni destinatario.
Una mail per persona, mai tutti in copia. Provider: [Resend](https://resend.com),
dietro l'interfaccia `MailProvider` in `src/lib/mail.ts` (per passare a Brevo o SES
basta un secondo adattatore).

## Variabili d'ambiente (Vercel → Settings → Environment Variables)

| Variabile | Obbligatoria | Note |
|---|---|---|
| `RESEND_API_KEY` | sì | Chiave API di Resend |
| `MAIL_FROM` | sì | Es. `L'Angolo del Vino <info@tuodominio.it>` |
| `MAIL_REPLY_TO` | consigliata | Dove arrivano le risposte e i «cancellami» |
| `MAIL_DAILY_LIMIT` | no | Default 100 (piano gratuito: 100/giorno, 3.000/mese) |

## Dominio mittente

Per scrivere da un tuo indirizzo il dominio va verificato su Resend aggiungendo i record
DNS (SPF e DKIM) che il pannello mostra; senza, Resend permette solo la modalità di
prova (mittente `onboarding@resend.dev`, destinatario solo il tuo indirizzo).
Senza SPF/DKIM le mail finiscono in spam.

## File Excel (.xlsx)

Si può caricare direttamente il file «Aziende Natale» (primo foglio): la riga dei titoli è
quella con la colonna «Email…». La pagina propone l'intestazione `Spett.le {Azienda / studio},`
(`{Titolo colonna}` inserisce il dato della riga), il filtro per priorità e, di default, esclude le
righe il cui «Presupposto invio» è vuoto o «Da verificare».

## Formato CSV

Due colonne, con o senza riga di titoli, separatore `,` `;` o tabulazione:

```
email;intestazione
mario@esempio.it;Gentile Dott. Rossi,
```

Indirizzi non validi e doppioni vengono scartati. Se l'intestazione è vuota si usa «Buongiorno,».

## Limiti noti

- Non c'è un elenco delle disiscrizioni: il piè di pagina chiede di rispondere «cancellami»
  e va tolto a mano dal file. Con liste più grandi conviene salvare le disiscrizioni nel database.
- Nessuno storico degli invii.
