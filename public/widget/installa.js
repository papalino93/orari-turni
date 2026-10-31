// ANGOLO_INSTALLA · L'Angolo del Vino · installatore dei widget per Scriptable.
// Lo scarica e lo avvia lo script «Angolo del Vino – installa» (quello con la chiave del telefono).
// Riceve SITO, CHIAVE e MODULO (il «module» di Scriptable, per sapere dove sono gli script).
// Crea uno script per ogni widget della persona e grandezza, «Angolo grande · Pannello», «Angolo medio · In sala»…:
// sul widget si sceglie quello con la stessa grandezza, senza scrivere niente. Se lo si riavvia aggiunge i
// widget nuovi; non cancella mai uno script (un widget già sulla Home resterebbe vuoto).

async function avviso(titolo, testo) {
  const a = new Alert();
  a.title = titolo;
  a.message = testo;
  a.addAction("OK");
  await a.presentAlert();
}

// Messo per sbaglio su un widget: lo dice, invece di restare vuoto.
if (config.runsInWidget) {
  const w = new ListWidget();
  w.backgroundColor = new Color("#FAF5EC");
  const t = w.addText("Questo è l'installatore. Tieni premuto il widget, «Modifica widget» e alla voce «Script» scegli uno degli «Angolo …» della stessa grandezza.");
  t.font = Font.mediumSystemFont(12);
  t.textColor = new Color("#4A0C18");
  Script.setWidget(w);
  Script.complete();
} else {
  let elenco = null;
  try {
    const r = new Request(`${SITO}/api/widget/elenco`);
    r.headers = { Authorization: `Bearer ${CHIAVE}`, "X-Device-Name": Device.name() };
    r.timeoutInterval = 15;
    elenco = await r.loadJSON();
  } catch (e) {}
  if (!elenco) {
    await avviso("Serve la rete", "Collegati a internet e tocca di nuovo ▶.");
  } else if (elenco.errore) {
    await avviso("Telefono non collegato", elenco.messaggio || "Ricollega il telefono dalla pagina «Widget sul telefono».");
  } else if (!elenco.widget.length) {
    await avviso("Nessun widget", "Non hai ancora nessun widget: chiedi al titolare di dartene qualcuno, poi tocca di nuovo ▶.");
  } else {
    // Gli script vanno accanto a questo: nella cartella di Scriptable (su iCloud o sul telefono).
    const qui = MODULO && MODULO.filename ? MODULO.filename : FileManager.local().joinPath(FileManager.local().documentsDirectory(), "installa.js");
    const suIcloud = qui.includes("/Mobile Documents/");
    const fm = suIcloud ? FileManager.iCloud() : FileManager.local();
    const cartella = qui.slice(0, qui.lastIndexOf("/"));
    // Non si cancella niente: un widget già sulla Home resta collegato al suo script anche se il nome
    // è quello di prima. Un widget tolto dal titolare mostra da solo «non è tra i tuoi».
    // Si scrive solo se cambia: riscrivere un file identico (soprattutto su iCloud) può staccare il widget.
    for (const w of elenco.widget) {
      const file = fm.joinPath(cartella, `${w.file}.js`);
      const testo = avviatore(w);
      try {
        if (fm.fileExists(file)) {
          if (suIcloud && !fm.isFileDownloaded(file)) await fm.downloadFileFromiCloud(file);
          if (fm.readString(file) === testo) continue;
        }
      } catch (e) {}
      fm.writeString(file, testo);
    }
    // Gli script col nome di prima («Angolo · Pannello», senza la grandezza): si aggiornano anch'essi,
    // così i widget che li usano continuano a funzionare.
    for (const f of fm.listContents(cartella)) {
      const m = f.match(/^Angolo · (.+)\.js$/);
      const w = m && elenco.widget.find((x) => x.nome === m[1]);
      if (w) {
        const file = fm.joinPath(cartella, f);
        try {
          if (suIcloud && !fm.isFileDownloaded(file)) await fm.downloadFileFromiCloud(file);
          if (fm.readString(file) !== avviatore(w)) fm.writeString(file, avviatore(w));
        } catch (e) {}
      }
    }
    // Raggruppati per grandezza: chi ha messo un widget medio guarda solo i «medio».
    const GRUPPI = [["piccolo", "Widget piccolo"], ["medio", "Widget medio"], ["grande", "Widget grande"], ["blocco", "Schermata di blocco"]];
    const righe = GRUPPI.map(([g, titolo]) => {
      const nomi = elenco.widget.filter((w) => w.grandezza === g).map((w) => `• ${w.nome}`);
      return nomi.length ? `${titolo}:\n${nomi.join("\n")}` : null;
    }).filter(Boolean);
    await avviso(
      "Pronti i tuoi widget",
      `Nell'elenco di Scriptable ora trovi gli «Angolo …», con la grandezza nel nome.\n\n${righe.join("\n\n")}\n\n` +
        "Per metterne uno sulla Home: tieni premuto uno spazio vuoto, «Modifica» → «Aggiungi widget» → Scriptable → scegli la grandezza → «Aggiungi widget». " +
        "Poi tocca il widget e alla voce «Script» scegli uno con la stessa grandezza (es. «Angolo medio · …» per un widget medio).",
    );
  }
  Script.complete();
}

// Lo script di un widget: scarica il disegno dal sito (ne tiene una copia per quando manca la rete) e lo avvia.
function avviatore(w) {
  return `// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: ${w.icona.colore}; icon-glyph: ${w.icona.disegno};
// L'Angolo del Vino · ${w.nome}. Creato dall'installatore: non serve toccarlo, si aggiorna da solo.
// Personale: dentro c'è la chiave di questo telefono. Si scollega dalla pagina «Widget sul telefono».
const SITO = ${JSON.stringify(SITO)};
const CHIAVE = ${JSON.stringify(CHIAVE)};
const WIDGET = ${JSON.stringify(w.id)};
const fm = FileManager.local();
const copia = fm.joinPath(fm.documentsDirectory(), "angolo-disegno.js");
let codice = null;
try {
  const r = new Request(SITO + "/widget/angolo.js");
  r.timeoutInterval = 10;
  const t = await r.loadString();
  if (r.response.statusCode === 200 && t.startsWith("// ANGOLO_WIDGET")) {
    codice = t;
    fm.writeString(copia, t);
  }
} catch (e) {}
if (!codice && fm.fileExists(copia)) codice = fm.readString(copia);
if (codice) {
  const Avvia = Object.getPrototypeOf(async function () {}).constructor;
  await new Avvia("SITO", "CHIAVE", "WIDGET", codice)(SITO, CHIAVE, WIDGET);
} else {
  const w = new ListWidget();
  w.addText("L'Angolo del Vino: la prima volta serve la rete.");
  Script.setWidget(w);
  Script.complete();
}
`;
}
