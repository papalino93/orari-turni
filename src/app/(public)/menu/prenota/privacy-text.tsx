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
      {/* TODO(titolare): aggiungere ragione sociale e partita IVA del titolare del trattamento. */}
      <p className={p}>
        L&apos;Angolo del Vino{address ? `, ${address}` : ""}
        {phone ? ` (telefono ${phone})` : ""}.
      </p>

      <h2 className={h}>Quali dati</h2>
      <p className={p}>
        Nome, telefono, email (solo se scegli la risposta per email o se chiedi le novità), giorno, ora, numero di persone e la nota,
        se la scrivi. Nome e telefono servono: senza, non possiamo risponderti.
      </p>
      <p className={`${p} mt-2`}>
        Per le allergie ci dici solo «sì» o «no»: i dettagli li chiediamo al tavolo e non li salviamo. Il «sì» sulle allergie è
        un&apos;informazione generica: non dice chi né cosa.
      </p>

      <h2 className={h}>Perché</h2>
      <p className={p}>
        Per rispondere alla tua richiesta e gestire la prenotazione: confermarla, proporti un altro orario o avvisarti se cambia
        qualcosa. Lo facciamo perché ce lo chiedi tu, prima di venire da noi (art. 6.1.b del Regolamento europeo GDPR).
      </p>

      <h2 className={h}>Le novità per email, solo se le chiedi</h2>
      <p className={p}>
        Se spunti «Voglio ricevere via email le novità e gli eventi dell&apos;Angolo del Vino», teniamo nome, email e (se c&apos;è) telefono nella
        nostra rubrica per mandarti ogni tanto le novità e gli eventi, insieme alla data e al testo della casella che hai spuntato. Lo
        facciamo perché ce lo chiedi tu (art. 6.1.a del GDPR). È facoltativo: senza la spunta l&apos;email serve solo per la
        prenotazione. Puoi smettere quando vuoi con il link «Non voglio più ricevere queste email» in fondo a ogni mail, o chiedendocelo:
        da quel momento non ti scriviamo più.
      </p>

      <h2 className={h}>Per quanto tempo</h2>
      <p className={p}>
        I dati della prenotazione: fino a 6 mesi dopo il giorno prenotato, poi li cancelliamo. Quelli per le novità: finché non ci chiedi
        di smettere o di cancellarli.
      </p>

      <h2 className={h}>Chi ci aiuta</h2>
      <p className={p}>
        Non vendiamo i tuoi dati e, senza la tua spunta, non ti scriviamo per pubblicità. Li vedono solo i servizi che fanno funzionare il sito (hosting
        Vercel, database, servizio email), che li trattano per nostro conto; alcuni hanno server fuori dall&apos;Unione europea, con
        le garanzie previste dal GDPR. Se scegli WhatsApp, i messaggi passano da WhatsApp (Meta).
      </p>

      <h2 className={h}>Cookie</h2>
      <p className={p}>Su queste pagine non ci sono cookie di profilazione.</p>

      <h2 className={h}>I tuoi diritti</h2>
      <p className={p}>
        Puoi chiederci in ogni momento di vedere, correggere o cancellare i tuoi dati: chiamaci, scrivici o chiedi al locale. Puoi
        anche annullare la richiesta dalla sua pagina. Se pensi che non li trattiamo bene, puoi rivolgerti al Garante per la
        protezione dei dati personali.
      </p>
    </div>
  );
}
