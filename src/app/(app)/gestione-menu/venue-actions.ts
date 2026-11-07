"use server";

import { prisma } from "@/lib/prisma";
import { requireMenuEditor } from "@/lib/guard";
import { diff, logChange } from "@/lib/menu-log";
import { revalidateMenu } from "@/lib/menu";
import { businessDayKey } from "@/lib/menu-format";
import {
  exceptionNotice,
  internationalNumber,
  isDayKey,
  isHttpsUrl,
  isTime,
  parseHours,
  type Contacts,
  type Hero,
  type Hours,
  type HoursException,
  type Range,
} from "@/lib/menu-venue";
import { assert, parseText, runAction, ValidationError, type ActionResult } from "@/lib/validation";
import type { ChangeResult } from "./actions";

// Copertina, orari e contatti del locale: impostazioni JSON in MenuSetting
// (chiavi "hero", "hours", "contacts"). Ogni salvataggio è nello storico con
// «Annulla» (RESTORABLE.setting riscrive il valore precedente).

const MAX_IMAGE_BYTES = 900 * 1024;

async function saveSetting(id: "hero" | "hours" | "contacts", label: string, next: unknown): Promise<ChangeResult> {
  const editor = await requireMenuEditor();
  const value = JSON.stringify(next);
  const current = await prisma.menuSetting.findUnique({ where: { id } });
  if (current?.value === value) return { changeId: null };
  const changeId = await prisma.$transaction(async (tx) => {
    await tx.menuSetting.upsert({ where: { id }, create: { id, value }, update: { value } });
    return logChange(tx, {
      actorName: editor.name,
      action: "UPDATE",
      entity: "setting",
      entityId: id,
      label,
      before: { value: current?.value ?? "" },
      after: { value },
    });
  });
  revalidateMenu();
  return { changeId };
}

// --- Copertina -----------------------------------------------------------------

export async function saveHero(input: Hero): Promise<ActionResult<ChangeResult>> {
  return runAction(async () => {
    const title = typeof input?.title === "string" ? input.title.replace(/\r/g, "").trim() : "";
    assert(title.length > 0, "Scrivi il titolo della copertina.");
    const lines = title.split("\n").map((l) => l.trim()).filter(Boolean);
    assert(lines.length <= 3, "Al massimo 3 righe.");
    assert(lines.every((l) => l.length <= 40), "Ogni riga: massimo 40 caratteri.");
    return saveSetting("hero", "Copertina", { title: lines.join("\n") });
  });
}

export async function saveHeroImage(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await requireMenuEditor();
    const file = formData.get("file");
    assert(file instanceof Blob && file.size > 0, "Nessuna foto selezionata.");
    assert(file.size <= MAX_IMAGE_BYTES, "La foto è troppo pesante.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45;
    assert(isJpeg || isPng || isWebp, "Formato non supportato: usa una foto JPEG, PNG o WebP.");
    const mimeType = isJpeg ? "image/jpeg" : isPng ? "image/png" : "image/webp";
    const data = Buffer.from(bytes);
    await prisma.menuHeroImage.upsert({ where: { id: "hero" }, create: { id: "hero", data, mimeType }, update: { data, mimeType } });
    revalidateMenu();
  });
}

export async function removeHeroImage(): Promise<ActionResult> {
  return runAction(async () => {
    await requireMenuEditor();
    await prisma.menuHeroImage.deleteMany({ where: { id: "hero" } });
    revalidateMenu();
  });
}

// --- Orari ---------------------------------------------------------------------

function parseRangesInput(value: unknown, where: string): Range[] {
  const list = Array.isArray(value) ? value : [];
  assert(list.length <= 4, `${where}: al massimo 4 fasce.`);
  return list.map((x: { open?: unknown; close?: unknown }) => {
    if (!isTime(x?.open) || !isTime(x?.close)) throw new ValidationError(`${where}: orario non valido.`);
    assert(x.open !== x.close, `${where}: apertura e chiusura uguali.`);
    return { open: x.open, close: x.close };
  });
}

// Nuova chiusura dal sito: «announce» chiede di pubblicare anche l'annuncio sul menù.
export type HoursInput = Omit<Hours, "exceptions"> & { exceptions: (HoursException & { announce?: boolean })[] };

export type HoursResult = ChangeResult & {
  // Annunci delle chiusure: pubblicati, tolti, aggiornati, e quelli col testo scritto
  // a mano (non aggiornato da solo) da ricontrollare perché le date sono cambiate.
  notices: { created: number; removed: number; updated: number; toCheck: string[] };
};

async function noticeSlug(title: string): Promise<string> {
  const base =
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "annuncio";
  for (let i = 0; i < 5; i++) {
    const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    if (!(await prisma.menuPromo.findUnique({ where: { slug } }))) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

const sameException = (a: HoursException, b: HoursException) =>
  a.startDate === b.startDate && a.endDate === b.endDate && a.closed === b.closed && a.note === b.note && JSON.stringify(a.ranges) === JSON.stringify(b.ranges);

export async function saveHours(input: HoursInput): Promise<ActionResult<HoursResult>> {
  return runAction(async () => {
    const editor = await requireMenuEditor();
    assert(Array.isArray(input?.weekly) && input.weekly.length === 7, "Orari della settimana non validi.");
    const weekly = input.weekly.map((ranges, i) => parseRangesInput(ranges, ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"][i]));
    const rawExceptions = Array.isArray(input.exceptions) ? input.exceptions : [];
    assert(rawExceptions.length <= 60, "Troppe eccezioni.");

    // Il collegamento chiusura → annuncio si legge da ciò che è salvato, non dal browser.
    const current = await prisma.menuSetting.findUnique({ where: { id: "hours" } });
    const previous = new Map(parseHours(current?.value).exceptions.map((e) => [e.id, e]));
    const today = businessDayKey();

    const toAnnounce = new Set<string>();
    const exceptions: HoursException[] = rawExceptions.map((e, i) => {
      assert(typeof e?.id === "string" && e.id.length > 0 && e.id.length <= 40, "Eccezione non valida.");
      assert(isDayKey(e.startDate) && isDayKey(e.endDate), `Eccezione ${i + 1}: date non valide.`);
      assert(e.startDate <= e.endDate, `Eccezione ${i + 1}: «al» prima di «dal».`);
      const closed = Boolean(e.closed);
      const ranges = closed ? [] : parseRangesInput(e.ranges, `Eccezione ${i + 1}`);
      assert(closed || ranges.length > 0, `Eccezione ${i + 1}: indica gli orari oppure «chiuso».`);
      const before = previous.get(e.id);
      // Una chiusura nuova riceve un codice definitivo: così, riaprendo gli orari, non sembra
      // più «appena aggiunta» (e non si può pubblicare un secondo annuncio).
      const id = before ? e.id : `ex-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 6)}`;
      if (!before && e.announce === true) toAnnounce.add(id);
      const note = parseText(e.note, "nota", { max: 120 });
      return { id, startDate: e.startDate, endDate: e.endDate, closed, ranges, note, ...(before?.promoId ? { promoId: before.promoId } : {}) };
    });
    assert(new Set(exceptions.map((e) => e.id)).size === exceptions.length, "Eccezione ripetuta: chiudi e riapri gli orari.");

    // Annunci collegati alle chiusure eliminate (non quelle già passate, che il sito
    // toglie da solo dall'elenco) o cambiate.
    const kept = new Map(exceptions.map((e) => [e.id, e]));
    const removedLinks = [...previous.values()].filter((e) => e.promoId && !kept.has(e.id) && e.endDate >= today);
    const changedLinks = exceptions.filter((e) => {
      const before = previous.get(e.id);
      return e.promoId && before && !sameException(before, e);
    });
    const linkedIds = [...removedLinks, ...changedLinks].map((e) => e.promoId!);
    const linked = new Map(
      (linkedIds.length ? await prisma.menuPromo.findMany({ where: { id: { in: linkedIds }, deletedAt: null } }) : []).map((p) => [p.id, p]),
    );
    const slugs = new Map<string, string>();
    for (const e of exceptions) if (toAnnounce.has(e.id)) slugs.set(e.id, await noticeSlug(exceptionNotice(e).title));

    const notices: HoursResult["notices"] = { created: 0, removed: 0, updated: 0, toCheck: [] };
    const value = JSON.stringify({ showStatus: input.showStatus !== false, weekly, exceptions });
    if (current?.value === value && toAnnounce.size === 0) return { changeId: null, notices };

    const changeId = await prisma.$transaction(async (tx) => {
      const now = new Date();
      for (const e of exceptions) {
        if (!toAnnounce.has(e.id)) continue;
        const { title, body } = exceptionNotice(e);
        const showFrom = today < e.startDate ? today : e.startDate;
        const promo = await tx.menuPromo.create({
          data: { kind: "NOTICE", slug: slugs.get(e.id)!, title, label: "Orari", body, showFrom, startDate: e.startDate, endDate: e.endDate },
        });
        e.promoId = promo.id;
        notices.created++;
        await logChange(tx, {
          actorName: editor.name,
          action: "CREATE",
          entity: "promo",
          entityId: promo.id,
          label: title,
          after: { title, label: "Orari", body, showFrom, startDate: e.startDate, endDate: e.endDate, startTime: null, endTime: null, hidden: false, hasMenu: true },
        });
      }
      for (const e of removedLinks) {
        const promo = linked.get(e.promoId!);
        if (!promo) continue;
        await tx.menuPromo.update({ where: { id: promo.id }, data: { deletedAt: now } });
        notices.removed++;
        await logChange(tx, {
          actorName: editor.name,
          action: "DELETE",
          entity: "promo",
          entityId: promo.id,
          label: promo.title,
          before: { deletedAt: null },
          after: { deletedAt: now.toISOString() },
        });
      }
      for (const e of changedLinks) {
        const promo = linked.get(e.promoId!);
        if (!promo) continue;
        const before = previous.get(e.id)!;
        const auto = exceptionNotice(before);
        const next = exceptionNotice(e);
        // Titolo e testo si rifanno da soli solo se non sono stati riscritti a mano.
        const titleAuto = promo.title === auto.title;
        const bodyAuto = (promo.body ?? "") === auto.body;
        const fields = {
          title: titleAuto ? next.title : promo.title,
          body: bodyAuto ? next.body : promo.body,
          showFrom: promo.showFrom < e.startDate ? promo.showFrom : e.startDate,
          startDate: e.startDate,
          endDate: e.endDate,
        };
        const changed = diff(
          { title: promo.title, body: promo.body, showFrom: promo.showFrom, startDate: promo.startDate, endDate: promo.endDate },
          fields,
        );
        const datesChanged = before.startDate !== e.startDate || before.endDate !== e.endDate || before.closed !== e.closed;
        if ((!titleAuto || !bodyAuto) && datesChanged) notices.toCheck.push(fields.title);
        if (!changed) continue;
        await tx.menuPromo.update({ where: { id: promo.id }, data: fields });
        notices.updated++;
        await logChange(tx, {
          actorName: editor.name,
          action: "UPDATE",
          entity: "promo",
          entityId: promo.id,
          label: fields.title,
          before: changed.before,
          after: changed.after,
        });
      }
      const saved = JSON.stringify({ showStatus: input.showStatus !== false, weekly, exceptions });
      await tx.menuSetting.upsert({ where: { id: "hours" }, create: { id: "hours", value: saved }, update: { value: saved } });
      return logChange(tx, {
        actorName: editor.name,
        action: "UPDATE",
        entity: "setting",
        entityId: "hours",
        label: "Orari",
        before: { value: current?.value ?? "" },
        after: { value: saved },
      });
    });
    revalidateMenu();
    // Con annunci pubblicati o tolti insieme agli orari niente «Annulla» rapido: rimetterebbe
    // solo gli orari e lascerebbe l'annuncio da solo. Restano nello storico, uno per uno.
    const touched = notices.created + notices.removed + notices.updated > 0;
    return { changeId: touched ? null : changeId, notices };
  });
}

// --- Contatti ------------------------------------------------------------------

export async function saveContacts(input: Contacts): Promise<ActionResult<ChangeResult>> {
  return runAction(async () => {
    const phone = parseText(input?.phone, "telefono", { max: 30 });
    assert(phone === "" || internationalNumber(phone) !== null, "Il telefono non sembra un numero valido.");
    const address = parseText(input?.address, "indirizzo", { max: 160 });
    const whatsappMessage = parseText(input?.whatsappMessage, "messaggio WhatsApp", { max: 300 });
    const instagram = parseText(input?.instagram, "link Instagram", { max: 300 });
    const review = parseText(input?.review, "link recensione", { max: 300 });
    assert(instagram === "" || isHttpsUrl(instagram), "Il link Instagram deve iniziare con https://");
    assert(review === "" || isHttpsUrl(review), "Il link della recensione deve iniziare con https://");
    return saveSetting("contacts", "Contatti", { phone, whatsappMessage, address, instagram, review });
  });
}
