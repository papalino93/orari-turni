// I widget per la Home del telefono (Scriptable). Puro: usato dalle pagine, dalle
// impostazioni e dall'indirizzo che dà i dati ai widget.
//
// - «per: admin»: solo titolare e consulente.
// - «per: tutti»: titolare e consulente sempre; un dipendente solo se autorizzato.
// - «per: dipendente»: dati personali del dipendente (i suoi turni).
//
// Sul telefono ogni widget è uno script «Angolo · <nome>» creato dall'installatore: si sceglie
// dall'elenco, senza scrivere niente. L'id resta la parola dei widget della prima versione.

export type WidgetSize = "small" | "medium" | "large" | "extraLarge" | "accessoryRectangular" | "accessoryCircular" | "accessoryInline";

export type WidgetDef = {
  id: string;
  nome: string;
  descrizione: string;
  per: "admin" | "tutti" | "dipendente";
  sizes: WidgetSize[];
  // Icona dello script in Scriptable (colore e disegno dell'app).
  icona?: { colore: string; disegno: string };
  // Widget della prima versione: funziona ancora per chi lo ha già, ma non si propone più.
  vecchio?: boolean;
};

export const WIDGETS: WidgetDef[] = [
  { id: "pannello", nome: "Pannello", descrizione: "Sei riquadri da toccare: il menù, il QR, le aperture di oggi, il fuori menù, chi lavora stasera, le cose da fare. Ai dipendenti mostra il loro turno, gli esauriti e le loro ore.", per: "tutti", sizes: ["large"], icona: { colore: "deep-brown", disegno: "th-large" } },
  { id: "sala", nome: "In sala", descrizione: "Durante il servizio: le aperture di oggi contro ieri alla stessa ora, chi è al lavoro, gli esauriti e le parole cercate che nel menù non ci sono.", per: "admin", sizes: ["medium"], icona: { colore: "deep-red", disegno: "chart-line" } },
  { id: "mattina", nome: "Prima di aprire", descrizione: "La mattina: com'è andata ieri, chi lavora oggi, l'evento della sera e le cose da sistemare.", per: "admin", sizes: ["medium"], icona: { colore: "orange", disegno: "sun" } },
  { id: "stasera", nome: "Stasera", descrizione: "L'evento di oggi, o il prossimo, con la locandina, l'orario e quante persone hanno aperto la sua pagina.", per: "tutti", sizes: ["medium"], icona: { colore: "purple", disegno: "star" } },
  { id: "clienti", nome: "Da dire ai clienti", descrizione: "Per chi è in sala: il fuori menù con i prezzi, i consigli della casa, gli esauriti e l'evento di stasera.", per: "tutti", sizes: ["medium"], icona: { colore: "deep-green", disegno: "comments" } },
  { id: "andamento", nome: "Andamento", descrizione: "Per il consulente: la settimana e il mese in corso contro gli stessi giorni di prima, settimana per settimana, i mesi interi, quanto rendono gli eventi, il momento più forte, le ore in turno.", per: "admin", sizes: ["large"], icona: { colore: "deep-blue", disegno: "chart-bar" } },
  { id: "apri", nome: "Apri il menù", descrizione: "Un tocco e il menù dei clienti è sullo schermo, da mostrare.", per: "tutti", sizes: ["small"], icona: { colore: "deep-brown", disegno: "wine-glass" } },
  { id: "qr", nome: "QR del menù", descrizione: "Il codice dei tavoli, grande, da far inquadrare a chi non lo trova.", per: "tutti", sizes: ["small", "large"], icona: { colore: "deep-gray", disegno: "qrcode" } },
  { id: "aperture", nome: "Aperture di oggi", descrizione: "Quante volte è stato aperto il menù oggi, anche sulla schermata di blocco, sotto l'orologio.", per: "admin", sizes: ["small", "accessoryRectangular", "accessoryCircular", "accessoryInline"], icona: { colore: "deep-red", disegno: "eye" } },
  { id: "turni", nome: "I miei turni", descrizione: "Il prossimo turno e la settimana, solo con gli orari già confermati; anche sulla schermata di blocco.", per: "dipendente", sizes: ["small", "medium", "accessoryRectangular", "accessoryCircular", "accessoryInline"], icona: { colore: "teal", disegno: "calendar-alt" } },
  // Prima versione: restano per chi li ha già sul telefono.
  { id: "riepilogo", nome: "Riepilogo", descrizione: "", per: "admin", sizes: ["medium", "large", "extraLarge"], vecchio: true },
  { id: "settimana", nome: "Statistiche della settimana", descrizione: "", per: "admin", sizes: ["medium", "large"], vecchio: true },
  { id: "oggi", nome: "Oggi al locale", descrizione: "", per: "admin", sizes: ["small", "medium", "large"], vecchio: true },
  { id: "dafare", nome: "Da fare", descrizione: "", per: "admin", sizes: ["small", "medium"], vecchio: true },
  { id: "menu", nome: "Anteprima menù", descrizione: "", per: "admin", sizes: ["medium", "large"], vecchio: true },
  { id: "fuorimenu", nome: "Oggi fuori menù ed eventi", descrizione: "", per: "admin", sizes: ["medium", "large"], vecchio: true },
];

// Gli script che l'installatore crea in Scriptable, uno per grandezza: nel nome c'è la grandezza
// («Angolo medio · In sala»), così dopo aver messo un widget medio si sceglie tra quelli «medio».
export const SCRIPT_GROUPS = [
  { id: "piccolo", sizes: ["small"] },
  { id: "medio", sizes: ["medium"] },
  { id: "grande", sizes: ["large"] },
  { id: "blocco", sizes: ["accessoryRectangular", "accessoryCircular", "accessoryInline"] },
] as const;
export function scriptFiles(w: WidgetDef): { gruppo: string; file: string }[] {
  return SCRIPT_GROUPS.filter((g) => g.sizes.some((s) => w.sizes.includes(s))).map((g) => ({ gruppo: g.id, file: `Angolo ${g.id} · ${w.nome}` }));
}

export const WIDGET_IDS = WIDGETS.map((w) => w.id);
// Quelli che il titolare può dare a un dipendente.
export const EMPLOYEE_WIDGETS = WIDGETS.filter((w) => w.per !== "admin" && !w.vecchio);
export const ADMIN_WIDGETS = WIDGETS.filter((w) => w.per !== "dipendente" && !w.vecchio);

export function widgetById(id: string): WidgetDef | undefined {
  return WIDGETS.find((w) => w.id === id);
}

export const SIZE_LABELS: Record<WidgetSize, string> = {
  small: "piccolo",
  medium: "medio",
  large: "grande",
  extraLarge: "extra grande (iPad)",
  accessoryRectangular: "schermata di blocco",
  accessoryCircular: "schermata di blocco, tondo",
  accessoryInline: "schermata di blocco, riga",
};

// Colori dei widget. Il primo è quello di partenza.
export const WIDGET_THEMES = [
  { id: "crema", nome: "Crema", descrizione: "Scritte bordeaux, come il menù stampato" },
  { id: "carta", nome: "Carta e inchiostro", descrizione: "Bianco pulito, scritte nere, dettagli vino" },
  { id: "oro", nome: "Oro", descrizione: "Fondo dorato, scritte color vino" },
  { id: "bordeaux", nome: "Bordeaux", descrizione: "Scritte crema e oro" },
  { id: "notte", nome: "Bordeaux notte", descrizione: "Bordeaux scurissimo e oro" },
  { id: "nero", nome: "Nero", descrizione: "Scritte crema, accenti color vino" },
  { id: "oliva", nome: "Oliva", descrizione: "Verde oliva e oro, come una vigna" },
  { id: "blu", nome: "Blu notte", descrizione: "Blu profondo e oro" },
] as const;
export const DEFAULT_THEME = "crema";

// Il QR stampato sui tavoli: non cambia mai.
export const MENU_QR_URL = "https://qrco.de/bes4Ad";

// Una chiave non usata da tanto si spegne da sola: basta ricollegare il telefono.
export const KEY_IDLE_DAYS = 90;
