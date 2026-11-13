// Rubrica della pagina Mail: le parole e le regole condivise da server e browser (niente database
// qui). I contatti stanno in MailContact, i gruppi in MailGroup; chi non vuole più email in
// MailOptOut, legato per indirizzo. La lettura dei file del telefono è in contact-import.ts.

// Perché possiamo scrivergli. Le stesse tre risposte al passo 3 dell'invio, nell'importazione e
// nella scheda del contatto.
export type Consent = "chiesto" | "cliente" | "altro";
export const CONSENTS: { id: Consent; label: string; plural: string; short: string }[] = [
  { id: "cliente", label: "È un cliente o un contatto già avuto", plural: "Sono clienti o contatti già avuti", short: "Cliente o contatto" },
  { id: "chiesto", label: "Ha chiesto di ricevere le nostre email", plural: "Hanno chiesto di riceverle", short: "Ha chiesto le email" },
  { id: "altro", label: "Altro motivo", plural: "Altro motivo", short: "Altro motivo" },
];
export const isConsent = (v: unknown): v is Consent => v === "chiesto" || v === "cliente" || v === "altro";
export const consentShort = (c: string) => CONSENTS.find((x) => x.id === c)?.short ?? "Altro motivo";

// Da dove arriva il contatto.
export type ContactSource = "mano" | "file" | "incollato" | "telefono" | "sito" | "invio";
export const SOURCE_LABEL: Record<ContactSource, string> = {
  mano: "scritto a mano",
  file: "da un file",
  incollato: "da un elenco incollato",
  telefono: "dalla rubrica del telefono",
  sito: "prenotando dal sito",
  invio: "con un invio",
};
export const isSource = (v: unknown): v is ContactSource => typeof v === "string" && v in SOURCE_LABEL;
export const sourceLabel = (s: string) => SOURCE_LABEL[s as ContactSource] ?? s;

// La casella del modulo delle prenotazioni: questo testo va anche nella nota del consenso.
export const BOOKING_OPTIN_TEXT = "Voglio ricevere via email le novità e gli eventi dell'Angolo del Vino";
export const SITE_GROUP_NAME = "Clienti dal sito";

// Tavolozza dei gruppi: un pallino colorato accanto al nome (il testo resta nei colori del tema,
// così si legge in chiaro e in scuro). Toni medi, visibili su fondo chiaro e scuro.
export const GROUP_COLORS = [
  { id: "vino", label: "Vino", hex: "#a8334f" },
  { id: "oro", label: "Oro", hex: "#b8892c" },
  { id: "verde", label: "Verde", hex: "#3f8f5f" },
  { id: "blu", label: "Blu", hex: "#3d7ab8" },
  { id: "viola", label: "Viola", hex: "#7e57b0" },
  { id: "grigio", label: "Grigio", hex: "#8a8288" },
] as const;
export type GroupColor = (typeof GROUP_COLORS)[number]["id"];
export const isGroupColor = (v: unknown): v is GroupColor => GROUP_COLORS.some((c) => c.id === v);
export const groupHex = (id: string) => GROUP_COLORS.find((c) => c.id === id)?.hex ?? GROUP_COLORS[0].hex;

// Un contatto come arriva al browser (date in ISO).
export type RContact = {
  id: string;
  email: string;
  name: string;
  phone: string;
  notes: string;
  source: string;
  consent: string;
  consentAt: string;
  consentNote: string;
  createdAt: string;
  lastSentAt: string | null;
  sentCount: number;
  groups: string[];
  // Non vuole più email: da quando e come (null = può ricevere).
  out: { at: string; source: string } | null;
};
export type RGroup = { id: string; name: string; color: string; sortOrder: number };
export type RubricaData = { contacts: RContact[]; groups: RGroup[] };

// Ricerca senza accenti e senza maiuscole: «nicolo» trova «Nicolò».
export function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

// Indirizzo come lo salviamo: senza spazi, in minuscolo; i caratteri invisibili copiati dalle
// rubriche (spazi unificatori, segni di direzione del testo) si tolgono.
export function cleanEmail(s: string): string {
  return s.replace(/[\s\u00A0\u200B-\u200F\u2060\uFEFF]/g, "").replace(/^mailto:/i, "").toLowerCase();
}

export function cleanName(s: string): string {
  return s.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 200);
}

// Chiave di ricerca di un contatto, calcolata una volta per contatto (vedi useRubricaIndex).
export function searchKey(c: Pick<RContact, "name" | "email" | "notes">): string {
  return fold(`${c.name} ${c.email} ${c.notes}`);
}

// Un contatto corrisponde se ogni parola cercata è nel nome, nell'email, nelle note o, per i
// numeri, nel telefono (solo le cifre: «333 12» trova «+39 333 1234567»).
export function matches(key: string, phoneDigits: string, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const digits = query.replace(/\D/g, "");
  if (digits.length >= 3 && /^[\d\s+().-]+$/.test(query.trim()) && phoneDigits.includes(digits)) return true;
  return words.every((w) => key.includes(w));
}

export type SortBy = "nome" | "ultima" | "recenti";
export const SORTS: { id: SortBy; label: string }[] = [
  { id: "nome", label: "Nome" },
  { id: "ultima", label: "Ultima mail" },
  { id: "recenti", label: "Aggiunti da poco" },
];
const collator = new Intl.Collator("it", { sensitivity: "base", numeric: true });
export function compareContacts(a: RContact, b: RContact, by: SortBy): number {
  if (by === "ultima") {
    const x = a.lastSentAt ?? "";
    const y = b.lastSentAt ?? "";
    if (x !== y) return x < y ? 1 : -1;
  } else if (by === "recenti") {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  }
  // Per nome: chi non ha un nome va in fondo, in ordine di email.
  if (!a.name !== !b.name) return a.name ? -1 : 1;
  return collator.compare(a.name || a.email, b.name || b.email) || collator.compare(a.email, b.email);
}

const dayFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short" });
const dayYearFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", year: "numeric" });
// «3 nov» quest'anno, «3 nov 2025» gli anni prima.
export function shortDay(iso: string, now = new Date()): string {
  const d = new Date(iso);
  return (d.getFullYear() === now.getFullYear() ? dayFmt : dayYearFmt).format(d).replace(".", "");
}
export function longDay(iso: string): string {
  return dayYearFmt.format(new Date(iso)).replace(".", "");
}

export const OPTOUT_LABEL: Record<string, string> = {
  link: "dal link nella mail",
  "one-click": "dal programma di posta",
  "a mano": "segnato a mano",
  cancellazione: "ha chiesto di cancellare i suoi dati",
};

// Numeri all'italiana: 5.000.
export const n = (x: number) => x.toLocaleString("it-IT");
