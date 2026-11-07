// Informativa sulla privacy delle prenotazioni: la stessa nella pagina /menu/prenota/privacy e
// nella finestra che si apre dal modulo (così chi la legge non perde quello che ha scritto).

const h = "menu-sans mb-1.5 mt-6 text-[11px] font-medium uppercase tracking-[0.22em] text-[#7A5A22]";
const p = "m-0 text-pretty text-[16.5px] leading-[1.5] text-[#3F4540]";

export function PrivacyText({ address, phone }: { address: string; phone: string }) {
  return (
    <div>
      <p className={p}>
        Quando chiedi un tavolo dal sito ci lasci alcuni dati. Qui ti spieghiamo, in breve, cosa ne facciamo.
      </p>

      <h2 className={h}>Chi tratta i dati</h2>
      <p className={p}>
        L&apos;Angolo del Vino{address ? `, ${address}` : ""}
        {phone ? ` (telefono ${phone})` : ""}.
      </p>

      <h2 className={h}>Quali dati</h2>
      <p className={p}>
        Nome, telefono, email (solo se scegli la risposta per email), giorno, ora, numero di persone e la nota, se la scrivi. Per le
        allergie ci dici solo «sì» o «no»: i dettagli li chiediamo al tavolo e non li salviamo.
      </p>

      <h2 className={h}>Perché</h2>
      <p className={p}>
        Per rispondere alla tua richiesta e gestire la prenotazione: confermarla, proporti un altro orario o avvisarti se cambia
        qualcosa. Lo facciamo perché ce lo chiedi tu, prima di venire da noi (art. 6.1.b del Regolamento europeo GDPR).
      </p>

      <h2 className={h}>Per quanto tempo</h2>
      <p className={p}>Fino a 6 mesi dopo il giorno della prenotazione, poi li cancelliamo.</p>

      <h2 className={h}>Cosa non facciamo</h2>
      <p className={p}>
        Non usiamo i tuoi dati per pubblicità e non li diamo ad altri. Su queste pagine non ci sono cookie di profilazione.
      </p>

      <h2 className={h}>Chi ci aiuta</h2>
      <p className={p}>
        I dati stanno sui servizi che fanno funzionare il sito: l&apos;hosting (Vercel), il database e il servizio che spedisce le
        email. Li usano solo per conto nostro. Se scegli la risposta su WhatsApp, ti scriviamo con WhatsApp dal telefono del locale.
      </p>

      <h2 className={h}>I tuoi diritti</h2>
      <p className={p}>
        Puoi chiederci in ogni momento di vedere, correggere o cancellare i tuoi dati: chiamaci, scrivici o chiedi al locale. Puoi
        anche annullare la richiesta dalla sua pagina. Se pensi che non li trattiamo bene, puoi rivolgerti al Garante per la
        protezione dei dati personali.
      </p>
    </div>
  );
}
