"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { runWithToast, useToast } from "@/components/toast";
import { SIZE_LABELS, WIDGET_THEMES, scriptName, type WidgetDef, type WidgetSize } from "@/lib/widgets";
import { createWidgetDevice, revokeWidgetDevice, setEmployeeWidgets, setWidgetTheme } from "./actions";

const APP_STORE = "https://apps.apple.com/it/app/scriptable/id1405459188";
const HOME_SIZES: WidgetSize[] = ["small", "medium", "large"];

// Dal computer: un QR per aprire questa pagina sul telefono (i passi si fanno lì).
export function PhoneQr({ admin }: { admin: boolean }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    const ua = navigator.userAgent;
    const phone = /iPhone|iPad|iPod|Android/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (phone) return;
    QRCode.toDataURL(`${location.origin}/widget`, { margin: 1, width: 300 }).then(setQr).catch(() => {});
  }, []);
  if (!qr) return null;
  return (
    <div className="flex items-center gap-5 rounded-2xl border border-accent/40 bg-surface px-5 py-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- immagine generata qui */}
      <img src={qr} alt="Codice QR per aprire questa pagina sul telefono" width={110} height={110} className="shrink-0 rounded-lg bg-white p-1" />
      <div>
        <p className="text-sm font-semibold text-foreground">Sei al computer?</p>
        <p className="mt-1 text-sm text-foreground-muted">
          I widget si mettono dal telefono: inquadra il codice con la fotocamera dell&apos;iPhone e segui i passi da lì.
          {admin && " Da qui puoi scegliere chi li può usare."}
        </p>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-foreground-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

// ---------- Chi può usare i widget (titolare e consulente)
export function AuthorizeList({ employees, widgets }: { employees: { id: string; name: string; widgets: string[] }[]; widgets: WidgetDef[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const save = (id: string, list: string[], msg: string) =>
    start(async () => {
      const r = await runWithToast(toast, () => setEmployeeWidgets(id, list), msg);
      if (r !== null) router.refresh();
    });
  return (
    <Section title="Chi può usare i widget" hint="Tu e il consulente li avete tutti. Per ogni dipendente scegli se può usarli e quali.">
      <details className="group border-b border-border px-5 py-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium text-accent-ink [&::-webkit-details-marker]:hidden">
          Come autorizzare un dipendente
          <span aria-hidden className="transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <ol className="mb-2 mt-1 space-y-2 text-sm text-foreground">
          {[
            "Accendi «Può usare i widget» accanto al suo nome.",
            "Lascia spuntati solo i widget che vuoi dargli: vedi com'è ognuno qui sotto, in «I widget».",
            "Da quel momento, nella sua app, trova «Widget sul telefono» con la stessa guida per installarli: vede solo quelli che hai scelto.",
            "Se gli dai un widget in più quando li ha già: apre Scriptable e tocca ▶ su «Angolo del Vino – installa». Il nuovo compare nell'elenco.",
            "Per togliere un widget togli la spunta; per togliere tutto spegni l'interruttore. Sul suo telefono il widget mostra «Accesso tolto» al primo aggiornamento.",
            "Telefono perso o cambiato? In fondo, in «Telefoni collegati», tocca «Scollega».",
          ].map((t, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-foreground-muted">{i + 1}</span>
              <span className="pt-0.5">{t}</span>
            </li>
          ))}
        </ol>
        <p className="mb-1 text-xs text-foreground-muted">
          Consiglio: «I miei turni» e «Pannello» a tutti; «Da dire ai clienti» e «Stasera» a chi sta in sala. I dipendenti non vedono mai statistiche né dati dei colleghi.
        </p>
      </details>
      {employees.length === 0 && <p className="px-5 py-4 text-sm text-foreground-muted">Nessun dipendente attivo.</p>}
      <ul className="divide-y divide-border">
        {employees.map((e) => {
          const on = e.widgets.length > 0;
          return (
            <li key={e.id} className="px-5 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-foreground">{e.name}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`Può usare i widget: ${e.name}`}
                  disabled={pending}
                  onClick={() => save(e.id, on ? [] : widgets.map((w) => w.id), on ? `${e.name} non può più usare i widget` : `${e.name} può usare i widget`)}
                  className="flex h-11 shrink-0 items-center gap-2 text-xs text-foreground-muted disabled:opacity-60"
                >
                  Può usare i widget
                  <span className={`relative h-6 w-11 rounded-full transition-colors ${on ? "bg-accent" : "bg-surface-2 ring-1 ring-inset ring-border"}`}>
                    <span aria-hidden className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[1.375rem]" : "left-0.5"}`} />
                  </span>
                </button>
              </div>
              {on && (
                <div className="mt-1 flex flex-wrap gap-2 pb-1">
                  {widgets.map((w) => {
                    const has = e.widgets.includes(w.id);
                    const next = has ? e.widgets.filter((x) => x !== w.id) : [...e.widgets, w.id];
                    return (
                      <button
                        key={w.id}
                        type="button"
                        aria-pressed={has}
                        disabled={pending}
                        onClick={() => save(e.id, next, has ? `Tolto «${w.nome}» a ${e.name}` : `Dato «${w.nome}» a ${e.name}`)}
                        className={`min-h-11 rounded-full border px-3.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                          has ? "border-accent bg-accent/10 text-foreground" : "border-border text-foreground-muted"
                        }`}
                      >
                        {has ? "✓ " : ""}
                        {w.nome}
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

// ---------- Colori dei widget: valgono per tutti i propri telefoni, subito (al primo aggiornamento)
// example: il widget delle anteprime e dell'esempio, uno di quelli che la persona può usare.
// preview: l'immagine di esempio (es. «sala-medium»), di un widget che la persona può usare.
export function ThemePicker({ current, preview, word }: { current: string; preview: string; word: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <Section title="Colori dei widget" hint="Valgono per tutti i tuoi widget e telefoni: l'iPhone li prende al primo aggiornamento, senza toccare niente.">
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        {WIDGET_THEMES.map((t) => {
          const on = t.id === current;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              disabled={pending || on}
              onClick={() =>
                start(async () => {
                  const r = await runWithToast(toast, () => setWidgetTheme(t.id), `Colori «${t.nome}» scelti`);
                  if (r !== null) router.refresh();
                })
              }
              className={`flex flex-col items-start gap-2 rounded-2xl border p-3 text-left transition-colors ${on ? "border-accent bg-accent/5 ring-2 ring-accent/40" : "border-border hover:border-accent"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- anteprima statica */}
              <img src={`/widget/anteprime/${t.id}/${preview}.png`} alt="" className={`rounded-[14px] shadow-sm ${preview.endsWith("-small") ? "w-1/2" : preview.endsWith("-large") ? "w-2/3" : "w-full"}`} />
              <span className="flex w-full items-center justify-between gap-2">
                <span>
                  <span className="block text-sm font-semibold text-foreground">{t.nome}</span>
                  <span className="block text-xs text-foreground-muted">{t.descrizione}</span>
                </span>
                <span className={`shrink-0 text-xs font-medium ${on ? "text-accent-ink" : "text-foreground-muted"}`}>{on ? "✓ In uso" : "Usa questi"}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="px-5 pb-4 text-xs text-foreground-muted">
        Vuoi un widget di un colore diverso dagli altri? Toccalo e nel campo «Parameter» scrivi il nome del colore, es.{" "}
        <code className="rounded bg-surface-2 px-1 font-mono text-foreground">nero</code> per «{word}».
      </p>
    </Section>
  );
}

// ---------- I widget disponibili, con l'anteprima e il nome che si sceglie sul telefono
export function WidgetGallery({ widgets, theme, dipendente = false }: { widgets: WidgetDef[]; theme: string; dipendente?: boolean }) {
  return (
    <Section title="I tuoi widget" hint="Com'è ognuno e in che grandezza va. Sul telefono, alla voce «Script», scegli il nome scritto qui.">
      <ul className="divide-y divide-border">
        {widgets.map((w) => {
          const preview = w.sizes.includes("medium") ? "medium" : w.sizes.includes("small") ? "small" : "large";
          // Il pannello dei dipendenti è diverso (il loro turno, le loro ore): si mostra il loro.
          const src = `/widget/anteprime/${theme}/${dipendente && w.id === "pannello" ? "pannello-dip" : w.id}-${preview}.png`;
          const home = w.sizes.filter((s) => HOME_SIZES.includes(s));
          return (
            <li key={w.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- anteprima statica disegnata dal simulatore */}
              <img
                src={src}
                alt={`Anteprima del widget «${w.nome}»`}
                className={`shrink-0 rounded-[18px] shadow-md ${preview === "small" ? "w-[132px]" : preview === "large" ? "w-full max-w-[240px]" : "w-full max-w-[300px]"}`}
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{w.nome}</p>
                <p className="mt-0.5 text-sm text-foreground-muted">{w.descrizione}</p>
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-foreground-muted">
                  <span className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-medium text-foreground">{scriptName(w)}</span>
                  <span>
                    {home.map((s) => SIZE_LABELS[s]).join(" o ")}
                    {w.sizes.some((s) => s.startsWith("accessory")) ? ", anche sulla schermata di blocco" : ""}
                  </span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

// ---------- Installazione, passo passo
// Lo script da incollare una volta: scarica dal sito l'installatore (installa.js) e lo avvia.
// L'installatore crea gli script «Angolo · …», uno per widget, con la chiave di questo telefono.
function scriptFor(origin: string, key: string, owner: string, phone: string) {
  return `// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-brown; icon-glyph: magic;
// L'Angolo del Vino · installatore dei widget di ${owner} (${phone})
// Tocca ▶ in basso: crea gli script «Angolo · …», uno per widget. Riavvialo quando ti danno un widget nuovo.
// Personale: non mandarlo ad altri, dentro c'è la chiave di questo telefono.
const SITO = "${origin}";
const CHIAVE = "${key}";
let codice = null;
try {
  const r = new Request(SITO + "/widget/installa.js");
  r.timeoutInterval = 15;
  const t = await r.loadString();
  if (r.response.statusCode === 200 && t.startsWith("// ANGOLO_INSTALLA")) codice = t;
} catch (e) {}
if (codice) {
  const Avvia = Object.getPrototypeOf(async function () {}).constructor;
  await new Avvia("SITO", "CHIAVE", "MODULO", codice)(SITO, CHIAVE, module);
} else {
  const a = new Alert();
  a.title = "Serve la rete";
  a.message = "Collegati a internet e tocca di nuovo ▶.";
  a.addAction("OK");
  await a.presentAlert();
  Script.complete();
}
`;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3.5 px-5 py-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <div className="mt-1 space-y-2 text-sm text-foreground-muted">{children}</div>
      </div>
    </li>
  );
}

// Piccoli disegni dei pulsanti dell'iPhone, per riconoscerli al volo.
function Key({ children }: { children: React.ReactNode }) {
  return <span className="mx-0.5 inline-flex items-center rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[12px] font-medium text-foreground">{children}</span>;
}

export function Installer({ ownerName, example }: { ownerName: string; example: string }) {
  const [phone, setPhone] = useState("");
  const [script, setScript] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function create() {
    start(async () => {
      const r = await runWithToast(toast, () => createWidgetDevice(phone), "Telefono collegato");
      if (r) {
        setScript(scriptFor(location.origin, r.key, ownerName, phone.trim()));
        router.refresh();
      }
    });
  }

  async function copy() {
    if (!script) return;
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      return;
    } catch {}
    // Riserva per i browser che non lasciano scrivere negli appunti: si seleziona il testo e si copia.
    const area = document.getElementById("widget-script") as HTMLTextAreaElement | null;
    if (area) {
      area.focus();
      area.select();
      area.setSelectionRange(0, area.value.length);
      if (document.execCommand("copy")) {
        setCopied(true);
        return;
      }
    }
    toast.showError("Non riesco a copiare: tieni premuto sul testo qui sotto e scegli «Copia».");
  }

  return (
    <Section title="Mettere i widget sul telefono" hint="Una volta sola per telefono: circa 3 minuti. Si fa tutto dall'iPhone.">
      <ol className="divide-y divide-border">
        <Step n={1} title="Scarica Scriptable">
          <p>È gratuita e non chiede di registrarsi.</p>
          <a href={APP_STORE} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-foreground px-4 text-sm font-medium text-background">
            Scarica dall&apos;App Store
          </a>
        </Step>
        <Step n={2} title="Collega questo telefono">
          {!script ? (
            <>
              <p>Dai un nome al telefono, così lo riconosci nell&apos;elenco (es. «iPhone di Andrea»).</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="es. iPhone di Andrea"
                  maxLength={40}
                  aria-label="Nome del telefono"
                  className="min-h-11 w-full min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 text-base text-foreground outline-none focus:border-accent sm:text-sm"
                />
                <button
                  type="button"
                  disabled={pending || !phone.trim()}
                  onClick={create}
                  className="min-h-11 rounded-full bg-accent px-4 text-sm font-medium text-accent-foreground disabled:bg-surface-2 disabled:text-foreground-muted disabled:ring-1 disabled:ring-border"
                >
                  {pending ? "Collego…" : "Crea il collegamento"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                Fatto: lo script con la chiave di questo telefono è pronto. <b className="text-foreground">Copialo</b> e passa al punto 3.
              </p>
              <button type="button" onClick={copy} className="min-h-11 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground">
                {copied ? "Copiato ✓" : "Copia lo script"}
              </button>
              <textarea id="widget-script" readOnly value={script} aria-label="Script da incollare in Scriptable" className="h-24 w-full rounded-xl border border-border bg-surface-2 p-2 font-mono text-[10px] text-foreground-muted" />
              <p className="text-xs">Non mandarlo ad altri: dentro c&apos;è la chiave di questo telefono. Ognuno collega il suo dalla sua app.</p>
            </>
          )}
        </Step>
        <Step n={3} title="Incollalo in Scriptable e avvialo">
          <p>
            Apri Scriptable, tocca <Key>+</Key> in alto a destra, tieni premuto nella pagina vuota e scegli <span className="whitespace-nowrap"><Key>Incolla</Key>.</span>
          </p>
          <p>
            Tocca il titolo in alto (es. «Untitled Script») e scrivi <b className="text-foreground">Angolo del Vino – installa</b>. Poi tocca{" "}
            <span className="whitespace-nowrap"><Key>▶</Key> in basso a destra.</span>
          </p>
          <p>
            Compare «Pronti N widget»: nell&apos;elenco di Scriptable ora ci sono gli script <b className="text-foreground">Angolo · Pannello</b>,{" "}
            <b className="text-foreground">Angolo · In sala</b>… uno per ogni widget qui sotto. Tocca <Key>OK</Key> e <Key>Fine</Key>.
          </p>
        </Step>
        <Step n={4} title="Metti un widget sulla Home">
          <p>
            Tieni premuto su uno spazio vuoto della Home finché le icone tremano, tocca <Key>Modifica</Key> in alto a sinistra, poi
            <span className="whitespace-nowrap"><Key>Aggiungi widget</Key>.</span>
          </p>
          <p>
            Cerca <b className="text-foreground">Scriptable</b>, scorri fino alla grandezza giusta (la trovi qui sotto, sotto ogni widget) e tocca
            <span className="whitespace-nowrap"><Key>Aggiungi widget</Key>.</span>
          </p>
        </Step>
        <Step n={5} title="Scegli quale widget mostrare">
          <p>
            Tocca il widget appena messo (o tienilo premuto e scegli <Key>Modifica widget</Key>). Alla voce <b className="text-foreground">Script</b>{" "}
            scegli dall&apos;elenco, ad esempio <b className="text-foreground">Angolo · {example}</b>. Non serve scrivere niente.
          </p>
          <p>Tocca fuori dal riquadro: in qualche secondo compare. Per averne altri ripeti i punti 4 e 5.</p>
        </Step>
        <Step n={6} title="Schermata di blocco (facoltativo)">
          <p>
            Tieni premuto sulla schermata di blocco, tocca <Key>Personalizza</Key> → <span className="whitespace-nowrap"><Key>Schermata di blocco</Key>,</span> tocca lo spazio sotto
            l&apos;ora, scegli Scriptable e poi, come al punto 5, lo script (es. «Angolo · Aperture di oggi» o «Angolo · I miei turni»). Si vede anche a
            telefono bloccato: mettici solo cose che possono vedere tutti.
          </p>
        </Step>
      </ol>
      <details className="group border-t border-border px-5 py-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium text-accent-ink [&::-webkit-details-marker]:hidden">
          Domande frequenti
          <span aria-hidden className="transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <dl className="mb-2 space-y-3 text-sm">
          {[
            ["Il widget non si aggiorna", "Lo decide l'iPhone: di solito ogni 15–30 minuti. In alto a destra c'è l'ora dell'ultimo aggiornamento; toccandolo si apre la pagina con i dati di adesso."],
            ["Compare «Accesso tolto»", "Il telefono è stato scollegato o il widget non ti è più permesso. Chiedi al titolare."],
            ["Compare «non aggiornato» in rosso", "Il telefono non era in rete: si vedono gli ultimi dati salvati, con la loro ora."],
            ["Mi hanno dato un widget nuovo", "Apri Scriptable e tocca ▶ su «Angolo del Vino – installa»: il nuovo compare nell'elenco. Quelli tolti spariscono."],
            ["Voglio un widget di un altro colore", "I colori si scelgono qui sotto, per tutti i tuoi widget. Per uno solo diverso: tocca il widget e alla voce «Parameter» scrivi il nome del colore (es. «nero» o «oliva»)."],
            ["Avevo già i widget della prima versione", "Continuano a funzionare. Per avere i nuovi collega di nuovo il telefono (punto 2) e segui i passi; poi scollega il collegamento vecchio in «Telefoni collegati»."],
            ["Ho cambiato telefono", "Collega il nuovo dal punto 2 e, in «Telefoni collegati», scollega il vecchio."],
            ["Ho perso il telefono", "Scrivi al titolare: con «Scollega» il widget smette subito di mostrare dati. Il sito resta protetto dalla tua password."],
            ["Ci sono widget per Android?", "Per ora no: Scriptable esiste solo per iPhone e iPad."],
          ].map(([q, a]) => (
            <div key={q}>
              <dt className="font-medium text-foreground">{q}</dt>
              <dd className="text-foreground-muted">{a}</dd>
            </div>
          ))}
        </dl>
      </details>
    </Section>
  );
}

// ---------- Telefoni collegati
export type DeviceRow = {
  id: string;
  name: string;
  owner: string;
  createdAt: string;
  lastUsedAt: string | null;
  deviceName: string | null;
  copied: boolean;
  expiringSoon: boolean;
};

const fmt = (iso: string) => new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

export function DeviceList({ devices, title, showOwner = false }: { devices: DeviceRow[]; title: string; showOwner?: boolean }) {
  const [asking, setAsking] = useState<DeviceRow | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <Section title={title} hint={devices.length ? "Ogni telefono ha la sua chiave. «Scollega» la spegne subito." : undefined}>
      {devices.length === 0 ? (
        <p className="px-5 py-4 text-sm text-foreground-muted">Nessun telefono collegato.</p>
      ) : (
        <ul className="divide-y divide-border">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {d.name}
                  {showOwner && <span className="font-normal text-foreground-muted"> · {d.owner}</span>}
                </p>
                <p className="text-xs text-foreground-muted">
                  {d.lastUsedAt ? `Ultimo aggiornamento ${fmt(d.lastUsedAt)}` : `Collegato ${fmt(d.createdAt)} · non ancora usato`}
                </p>
                {d.copied && <p className="mt-0.5 text-xs font-medium text-danger">Usato anche da un altro telefono: se non sei stato tu, scollegalo.</p>}
                {d.expiringSoon && !d.copied && <p className="mt-0.5 text-xs text-gold">Non usato da tanto: tra poco si spegne da solo.</p>}
              </div>
              <button type="button" onClick={() => setAsking(d)} className="min-h-11 shrink-0 rounded-full border border-border px-4 text-xs font-medium text-foreground-muted hover:border-danger hover:text-danger">
                Scollega
              </button>
            </li>
          ))}
        </ul>
      )}
      {asking && (
        <ConfirmSheet
          title={`Scollegare «${asking.name}»?`}
          confirmLabel="Sì, scollega"
          busyLabel="Scollego…"
          busy={pending}
          danger
          onCancel={() => setAsking(null)}
          onConfirm={() =>
            start(async () => {
              const r = await runWithToast(toast, () => revokeWidgetDevice(asking.id), "Telefono scollegato");
              if (r !== null) {
                setAsking(null);
                router.refresh();
              }
            })
          }
        >
          <p>I widget su quel telefono smettono subito di mostrare i dati e scrivono «Accesso tolto». Per riaverli va ricollegato.</p>
        </ConfirmSheet>
      )}
    </Section>
  );
}
