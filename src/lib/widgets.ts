// I widget per la Home del telefono (Scriptable). Puro: usato dalle pagine, dalle
// impostazioni e dall'indirizzo che dà i dati ai widget.
//
// - «per: admin»: solo titolare e consulente.
// - «per: tutti»: titolare e consulente sempre; un dipendente solo se autorizzato.
// - «per: dipendente»: dati personali del dipendente (i suoi turni).
//
// La parola (id) è quella che si scrive nel campo «Parameter» del widget su iPhone.

export type WidgetSize = "small" | "medium" | "large" | "extraLarge" | "accessoryRectangular" | "accessoryCircular" | "accessoryInline";

export type WidgetDef = {
  id: string;
  nome: string;
  descrizione: string;
  per: "admin" | "tutti" | "dipendente";
  sizes: WidgetSize[];
};

export const WIDGETS: WidgetDef[] = [
  { id: "aperture", nome: "Aperture di oggi", descrizione: "Quante volte è stato aperto il menù oggi, con ieri e lo stesso giorno della settimana scorsa.", per: "admin", sizes: ["small", "medium", "accessoryRectangular", "accessoryCircular", "accessoryInline"] },
  { id: "riepilogo", nome: "Riepilogo", descrizione: "I numeri principali: aperture di oggi e della settimana, ore in turno, prossimo evento.", per: "admin", sizes: ["medium", "large", "extraLarge"] },
  { id: "settimana", nome: "Statistiche della settimana", descrizione: "Le aperture da lunedì confrontate con la settimana scorsa, ora di punta, più cercato e più guardato.", per: "admin", sizes: ["medium", "large"] },
  { id: "oggi", nome: "Oggi al locale", descrizione: "Aperto o chiuso, chi lavora oggi e l'evento di stasera.", per: "admin", sizes: ["small", "medium", "large"] },
  { id: "dafare", nome: "Da fare", descrizione: "Allergeni da compilare, esauriti, settimana da confermare, mesi da approvare.", per: "admin", sizes: ["small", "medium"] },
  { id: "menu", nome: "Anteprima menù", descrizione: "Oggi fuori menù, i consigli della casa, gli esauriti e il prossimo evento.", per: "tutti", sizes: ["medium", "large"] },
  { id: "fuorimenu", nome: "Oggi fuori menù ed eventi", descrizione: "Il piatto e il vino del giorno, gli esauriti e l'evento di stasera.", per: "tutti", sizes: ["medium", "large"] },
  { id: "qr", nome: "QR del menù", descrizione: "Il codice QR dei tavoli, da mostrare a chi non lo trova.", per: "tutti", sizes: ["small", "large"] },
  { id: "turni", nome: "I miei prossimi orari", descrizione: "Il prossimo turno e la settimana, solo con gli orari già confermati.", per: "dipendente", sizes: ["small", "medium", "accessoryRectangular", "accessoryCircular", "accessoryInline"] },
];

export const WIDGET_IDS = WIDGETS.map((w) => w.id);
// Quelli che il titolare può dare a un dipendente.
export const EMPLOYEE_WIDGETS = WIDGETS.filter((w) => w.per !== "admin");
export const ADMIN_WIDGETS = WIDGETS.filter((w) => w.per !== "dipendente");

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
  { id: "bordeaux", nome: "Bordeaux", descrizione: "Scritte crema e oro" },
  { id: "nero", nome: "Nero", descrizione: "Scritte crema, accenti color vino" },
  { id: "notte", nome: "Bordeaux notte", descrizione: "Bordeaux scurissimo e oro" },
] as const;
export const DEFAULT_THEME = "crema";

// Il QR stampato sui tavoli: non cambia mai.
export const MENU_QR_URL = "https://qrco.de/bes4Ad";

// Una chiave non usata da tanto si spegne da sola: basta ricollegare il telefono.
export const KEY_IDLE_DAYS = 90;
