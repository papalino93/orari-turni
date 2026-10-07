// Mail: il file dei destinatari (Excel o CSV) si può anche trascinare sul riquadro, non solo
// sceglierlo con il pulsante. Un file di un tipo sbagliato o più file insieme danno un avviso.
import { zipSync, strToU8 } from "fflate";
import { launch, login, check, BASE, results, ADMIN_PW } from "./lib.mjs";

// Un .xlsx minimo (due colonne, due righe) costruito qui, senza programmi esterni.
const xlsx = zipSync({
  "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'),
  "xl/worksheets/sheet1.xml": strToU8(
    '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      '<row r="1"><c r="A1" t="inlineStr"><is><t>Email</t></is></c><c r="B1" t="inlineStr"><is><t>Azienda</t></is></c></row>' +
      '<row r="2"><c r="A2" t="inlineStr"><is><t>uno@esempio.it</t></is></c><c r="B2" t="inlineStr"><is><t>Uno Srl</t></is></c></row>' +
      '<row r="3"><c r="A3" t="inlineStr"><is><t>due@esempio.it</t></is></c><c r="B3" t="inlineStr"><is><t>Due Spa</t></is></c></row>' +
      "</sheetData></worksheet>",
  ),
});

const b = await launch();
for (const [label, w, h] of [["computer", 1440, 900], ["telefono", 390, 844]]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  p.setDefaultTimeout(20000);
  await login(p, "andrea", ADMIN_PW);
  const open = async () => {
    await p.goto(`${BASE}/mail`, { waitUntil: "networkidle", timeout: 180000 });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  };
  const zone = () => p.locator('label:has(input[type="file"])');
  // Trascina uno o più file (come farebbe il browser) sul riquadro; `over` = si ferma sopra senza rilasciare.
  const drop = (files, { over = false } = {}) =>
    p.evaluate(
      ([list, over]) => {
        const el = document.querySelector('label:has(input[type="file"])');
        const dt = new DataTransfer();
        for (const f of list) dt.items.add(new File([new Uint8Array(f.bytes)], f.name, { type: f.type }));
        el.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
        if (!over) el.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
      },
      [files.map((f) => ({ ...f, bytes: [...f.bytes] })), over],
    );
  const csv = (name, text) => ({ name, type: "text/csv", bytes: Buffer.from(text) });

  await open();
  check(`${label}: il riquadro dice che si può trascinare`, /trascinarlo qui/.test(await zone().innerText()));

  // Mentre il file è sopra, il riquadro si accende
  await drop([csv("a.csv", "x")], { over: true });
  check(`${label}: sopra il riquadro compare «Rilascia qui il file»`, /Rilascia qui il file/.test(await zone().innerText()));

  // CSV trascinato: letto come se fosse scelto
  await open();
  await drop([csv("lista.csv", "email;intestazione\nmario@esempio.it;Dott. Rossi\nlaura@esempio.it;Laura\nnon-una-mail;X\n")]);
  await p.getByText("File: lista.csv").waitFor();
  check(`${label}: CSV trascinato, nome del file mostrato`, true);
  check(`${label}: CSV trascinato, 2 destinatari (l'indirizzo sbagliato è scartato)`, /2\s+destinatari pronti/.test(await p.locator("main, body").first().innerText()));
  check(`${label}: il riquadro non resta acceso dopo il rilascio`, !/Rilascia qui il file/.test(await zone().innerText()));

  // Excel trascinato
  await open();
  await drop([{ name: "Aziende.xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: xlsx }]);
  await p.getByText("File: Aziende.xlsx").waitFor();
  check(`${label}: Excel trascinato, letto`, /2\s+destinatari pronti/.test(await p.locator("body").innerText()));

  // File sbagliato e più file
  await open();
  await drop([{ name: "foto.png", type: "image/png", bytes: Buffer.from("x") }]);
  check(`${label}: file di tipo sbagliato → avviso`, /«foto\.png» non va bene/.test(await p.locator("body").innerText()));
  check(`${label}: file sbagliato, non viene caricato`, (await p.getByText("File: foto.png").count()) === 0);
  await drop([csv("a.csv", "a@b.it"), csv("b.csv", "c@d.it")]);
  check(`${label}: più file insieme → avviso`, /Trascina un file solo/.test(await p.locator("body").innerText()));

  // Il pulsante «Scegli il file» funziona ancora
  await open();
  await p.locator('input[type="file"]').setInputFiles({ name: "scelto.csv", mimeType: "text/csv", buffer: Buffer.from("email\nuno@esempio.it\n") });
  await p.getByText("File: scelto.csv").waitFor();
  check(`${label}: «Scegli il file» funziona ancora`, /1\s+destinatario pronto/.test(await p.locator("body").innerText()));
}
await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
