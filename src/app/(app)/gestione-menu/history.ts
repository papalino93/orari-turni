// Storico delle modifiche del menù: dalle righe di MenuChange alle righe che vede il
// titolare. Per ognuna: che cosa è successo, che cosa è cambiato («Bottiglia 32 → 34,90»),
// se si può tornare indietro e con quale pulsante («Annulla aggiunta», «Rimetti nel menù»…).
// Solo server (lo usa page.tsx).

import { ALLERGENS } from "@/lib/allergens";
import { formatPrice, formatPromoDay, parseVariants } from "@/lib/menu-format";
import { traitLabel } from "@/lib/wine-traits";

// Filtri dello Storico, con i nomi delle schede della gestione.
export type HistoryGroup = "voci" | "esauriti" | "eventi" | "locale";

export type HistoryEntry = {
  id: string;
  at: string;
  actorName: string;
  // «Aggiunto», «Modificato», «Tolto dal menù»…
  title: string;
  label: string;
  // Che cosa è cambiato, in una riga (null = niente da dire).
  detail: string | null;
  group: HistoryGroup;
  undone: boolean;
  // Pulsante per tornare indietro, con la domanda di conferma; null = non si può o non serve.
  undo: { label: string; question: string } | null;
  // Perché non si può tornare indietro (es. «Voce eliminata»), al posto del pulsante.
  blocked: string | null;
};

type Row = {
  id: string;
  at: Date;
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  label: string;
  before: unknown;
  after: unknown;
  undoneById: string | null;
};

type Fields = Record<string, unknown>;

const FIELD_LABELS: Record<string, string> = {
  name: "Nome",
  wineName: "Nome del vino",
  denomination: "Denominazione",
  vintage: "Annata",
  sub: "Sottotitolo",
  grapes: "Uvaggio",
  region: "Regione",
  country: "Nazione",
  description: "Descrizione",
  priceGlassCents: "Calice",
  priceBottleCents: "Bottiglia",
  priceCents: "Prezzo",
  enomatic: "Enomatic",
  traits: "Caratteristiche",
  pairWineId: "Abbinamento",
  recommended: "Consigliato",
  pairDishIds: "Sta bene con",
  pairHideIds: "Sta bene con",
  allergens: "Allergeni",
  allergensReviewed: "Allergeni",
  allergenTraces: "Tracce",
  variants: "Formati",
  availableFrom: "Dal",
  availableTo: "Al",
  groupId: "Gruppo",
  title: "Titolo",
  label: "Titoletto",
  body: "Testo",
  text: "Testo",
  showFrom: "In vista dal",
  startDate: "Dal",
  endDate: "Al",
  startTime: "Dalle",
  endTime: "Alle",
  hidden: "Visibile",
  hasMenu: "Menù dedicato",
  menuMode: "Menù",
  menuNote: "Nota del menù",
  allergenNotice: "Avviso allergeni",
  note: "Nota",
  addonTitle: "Titolo dell'avviso",
  addon: "Avviso",
  kicker: "Riga sopra il titolo",
  formats: "Formati",
  placement: "Dove compare",
  sectionIds: "Categorie",
  kind: "Tipo",
};

// Campi che non dicono niente al titolare.
const SKIP = new Set(["columns", "sortOrder", "soldOutDay", "slug", "deletedAt"]);

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function short(value: unknown, key: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key.endsWith("Cents")) return formatPrice(value as number);
  if (typeof value === "string" && DATE_KEY.test(value)) return formatPromoDay(value);
  if (key === "variants") return (parseVariants(value) ?? []).map((v) => `${v.label} ${formatPrice(v.cents)}`).join(" · ") || "—";
  if (key === "formats" && Array.isArray(value)) return value.join(" · ") || "—";
  if ((key === "allergens" || key === "allergenTraces") && Array.isArray(value))
    return value.map((c) => ALLERGENS.find((a) => a.code === c)?.label ?? c).join(", ") || "nessuno";
  if (key === "traits" && Array.isArray(value)) return value.map((c) => traitLabel(String(c))).join(", ") || "nessuna";
  return String(value);
}

// Una modifica di un campo, in poche parole.
function fieldChange(key: string, before: unknown, after: unknown): string | null {
  if (SKIP.has(key)) return null;
  if (JSON.stringify(before ?? null) === JSON.stringify(after ?? null)) return null;
  const name = FIELD_LABELS[key];
  if (!name) return null;
  switch (key) {
    case "recommended":
      return `Consigliato: ${after ? "messo" : "tolto"}`;
    case "enomatic":
      return `Enomatic: ${after ? "sì" : "no"}`;
    case "hidden":
      return after ? "Nascosto ai clienti" : "Di nuovo visibile";
    case "hasMenu":
      return `Menù dedicato: ${after ? "sì" : "no"}`;
    case "allergensReviewed":
      return after ? "Allergeni compilati" : "Allergeni da compilare";
    case "groupId":
      return "Spostata in un altro gruppo";
    case "pairWineId":
      return after ? "Abbinamento cambiato" : "Abbinamento tolto";
    case "pairDishIds":
    case "pairHideIds":
      return "«Sta bene con» cambiato";
    case "sectionIds":
      return "Categorie cambiate";
    case "placement":
    case "kind":
    case "menuMode":
      return `${name} cambiato`;
  }
  const b = short(before, key);
  const a = short(after, key);
  if (b.length + a.length > 60) return `${name} cambiato`;
  return key.endsWith("Cents") ? `${name} ${b} → ${a}` : `${name}: ${b} → ${a}`;
}

function describeFields(before: Fields, after: Fields): string | null {
  const parts: string[] = [];
  for (const key of Object.keys(after)) {
    const text = fieldChange(key, before[key], after[key]);
    if (text && !parts.includes(text)) parts.push(text);
  }
  if (parts.length === 0) return null;
  return parts.length > 3 ? `${parts.slice(0, 3).join(" · ")} e altro` : parts.join(" · ");
}

// «Tabella prezzi»: una riga per voce, con il suo nome.
function describePrices(before: Fields, after: Fields, names: Map<string, string>): string | null {
  const b = (before.items ?? {}) as Record<string, Fields>;
  const a = (after.items ?? {}) as Record<string, Fields>;
  const parts = Object.keys(a).map((id) => {
    const text = describeFields(b[id] ?? {}, a[id] ?? {});
    return text ? `${names.get(id) ?? "Voce"}: ${text}` : null;
  });
  const list = parts.filter((p): p is string => Boolean(p));
  if (list.length === 0) return null;
  return list.length > 3 ? `${list.slice(0, 3).join(" · ")} e altre ${list.length - 3}` : list.join(" · ");
}

function asFields(value: unknown): Fields {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Fields) : {};
}

const CREATE_GONE: Record<string, (label: string) => string> = {
  item: (l) => `«${l}» sparirà dal menù.`,
  group: (l) => `Il gruppo «${l}» e le sue voci spariranno dal menù.`,
  section: (l) => `La categoria «${l}» e tutte le sue voci spariranno dal menù.`,
  promo: (l) => `«${l}» sparirà dal menù dei clienti.`,
  block: (l) => `«${l}» sparirà dal menù.`,
};

const DELETED_NOUN: Record<string, string> = {
  item: "Voce eliminata",
  group: "Gruppo eliminato",
  section: "Categoria eliminata",
  promo: "Pagina eliminata",
  block: "Informazione eliminata",
};

export function buildHistory(
  rows: Row[],
  {
    today,
    deleted,
    names,
    undoneActions,
  }: {
    // Giorno commerciale in corso (gli esauriti valgono solo oggi).
    today: string;
    // "entity:id" degli elementi eliminati adesso.
    deleted: Set<string>;
    // Nomi delle voci (per la «Tabella prezzi»).
    names: Map<string, string>;
    // Per ogni annullamento, l'azione che ha annullato (id della riga RESTORE → azione).
    undoneActions: Map<string, string>;
  },
): HistoryEntry[] {
  // Esauriti: solo l'ultima riga di ogni voce si può annullare (le altre sono già superate).
  const latestSold = new Set<string>();
  const latestSetting = new Set<string>();
  const seenSold = new Set<string>();
  const seenSetting = new Set<string>();
  for (const r of rows) {
    if (r.entity === "item" && (r.action === "SOLD_OUT" || r.action === "AVAILABLE") && !seenSold.has(r.entityId)) {
      seenSold.add(r.entityId);
      latestSold.add(r.id);
    }
    // Anche «Riattiva tutto» e gli annullamenti degli esauriti superano le righe più vecchie.
    if (r.action === "RESET_SOLD_OUT") {
      const items = asFields(r.before).items;
      if (Array.isArray(items)) for (const it of items as { id?: string }[]) if (it.id) seenSold.add(it.id);
    }
    if (r.action === "RESTORE" && r.entity === "item" && "soldOutDay" in asFields(r.after)) seenSold.add(r.entityId);
    if (r.entity === "setting" && !seenSetting.has(r.entityId)) {
      seenSetting.add(r.entityId);
      latestSetting.add(r.id);
    }
  }

  return rows.map((r) => {
    const before = asFields(r.before);
    const after = asFields(r.after);
    const bulk = r.entityId.startsWith("*");
    const isDeleted = !bulk && deleted.has(`${r.entity}:${r.entityId}`);
    const group: HistoryGroup =
      r.action === "SOLD_OUT" || r.action === "AVAILABLE" || r.action === "RESET_SOLD_OUT"
        ? "esauriti"
        : r.entity === "promo"
          ? "eventi"
          : r.entity === "setting" || r.entity === "block"
            ? "locale"
            : "voci";

    let title = "Modificato";
    let detail: string | null = null;
    let undo: HistoryEntry["undo"] = null;
    let blocked: string | null = null;

    switch (r.action) {
      case "CREATE":
        title = "Aggiunto";
        if (r.entityId === "*") undo = { label: "Annulla aggiunta", question: `Le ${r.label} spariranno dal menù.` };
        else if (!isDeleted) undo = { label: "Annulla aggiunta", question: (CREATE_GONE[r.entity] ?? CREATE_GONE.item)(r.label) };
        break;
      case "DELETE":
        title = "Eliminato";
        if (isDeleted)
          undo = {
            label: "Rimetti nel menù",
            question: r.entity === "group" ? `Il gruppo «${r.label}» torna sul menù con le sue voci.` : `«${r.label}» torna sul menù.`,
          };
        break;
      case "SOLD_OUT":
        title = "Segnato esaurito";
        if (isDeleted) blocked = DELETED_NOUN.item;
        else if (after.soldOutDay === today && latestSold.has(r.id)) undo = { label: "Rimetti disponibile", question: `«${r.label}» torna disponibile sul menù.` };
        break;
      case "AVAILABLE":
        title = "Di nuovo disponibile";
        if (isDeleted) blocked = DELETED_NOUN.item;
        else if (before.soldOutDay === today && latestSold.has(r.id))
          undo = { label: "Segna di nuovo esaurito", question: `«${r.label}» torna esaurito fino a domattina.` };
        break;
      case "RESET_SOLD_OUT": {
        title = "Riattivate le voci esaurite";
        const items = Array.isArray(before.items) ? (before.items as { soldOutDay?: string }[]) : [];
        if (items.some((i) => i.soldOutDay === today))
          undo = { label: "Segna di nuovo esaurite", question: `Tornano esaurite fino a domattina: ${r.label}.` };
        break;
      }
      case "RESTORE": {
        // Dice che cosa ha fatto l'annullamento, non «Ripristinato» (che dopo un'aggiunta tolta confonde).
        const original = undoneActions.get(r.id);
        title =
          original === "CREATE"
            ? "Annullata l'aggiunta"
            : original === "DELETE"
              ? "Rimesso nel menù"
              : original === "SOLD_OUT"
                ? "Rimesso disponibile"
                : original === "AVAILABLE"
                  ? "Segnato di nuovo esaurito"
                  : original === "RESET_SOLD_OUT"
                    ? "Segnate di nuovo esaurite"
                    : original === "UPDATE"
                      ? "Tornato com'era"
                      : typeof after.deletedAt === "string"
                        ? "Tolto dal menù"
                        : "deletedAt" in after
                          ? "Rimesso nel menù"
                          : "Annullata una modifica";
        // Es. «Consigliato: tolto» quando una voce torna senza (ce n'erano già 4).
        detail = r.entity === "setting" ? null : describeFields(before, after);
        break;
      }
      default: {
        // UPDATE
        if (r.entityId === "*order") {
          title = "Nuovo ordine";
          undo = { label: "Torna all'ordine di prima", question: `Rimetto l'ordine com'era prima (${r.label}).` };
        } else if (r.entityId === "*prices") {
          title = "Prezzi cambiati";
          detail = describePrices(before, after, names);
          const back = describePrices(after, before, names);
          undo = { label: "Torna ai prezzi di prima", question: back ? `Tornano i prezzi di prima: ${back}.` : "Tornano i prezzi di prima." };
        } else if (r.entity === "setting") {
          // Si salva tutto insieme (es. tutti gli orari): torna indietro solo l'ultima modifica.
          if (latestSetting.has(r.id)) undo = { label: "Torna a prima", question: `«${r.label}»: torna la versione di prima di questa modifica.` };
        } else {
          detail = describeFields(before, after);
          const back = describeFields(after, before);
          const onlyPrices = Object.keys(after).every((k) => k.endsWith("Cents") || k === "variants");
          if (isDeleted) blocked = DELETED_NOUN[r.entity] ?? "Eliminato";
          else
            undo = {
              label: onlyPrices ? "Torna al prezzo di prima" : "Torna com'era",
              question: back ? `«${r.label}» torna com'era: ${back}.` : `«${r.label}» torna com'era prima di questa modifica.`,
            };
        }
      }
    }

    const undone = r.undoneById !== null;
    return {
      id: r.id,
      at: r.at.toISOString(),
      actorName: r.actorName,
      title,
      label: r.label,
      detail,
      group,
      undone,
      undo: undone || r.action === "RESTORE" ? null : undo,
      blocked: undone ? null : blocked,
    };
  });
}
