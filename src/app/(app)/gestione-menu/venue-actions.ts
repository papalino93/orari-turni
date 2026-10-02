"use server";

import { prisma } from "@/lib/prisma";
import { requireMenuEditor } from "@/lib/guard";
import { logChange } from "@/lib/menu-log";
import { revalidateMenu } from "@/lib/menu";
import {
  internationalNumber,
  isDayKey,
  isHttpsUrl,
  isTime,
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

export async function saveHours(input: Hours): Promise<ActionResult<ChangeResult>> {
  return runAction(async () => {
    assert(Array.isArray(input?.weekly) && input.weekly.length === 7, "Orari della settimana non validi.");
    const weekly = input.weekly.map((ranges, i) => parseRangesInput(ranges, ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"][i]));
    const rawExceptions = Array.isArray(input.exceptions) ? input.exceptions : [];
    assert(rawExceptions.length <= 60, "Troppe eccezioni.");
    const exceptions: HoursException[] = rawExceptions.map((e, i) => {
      assert(typeof e?.id === "string" && e.id.length > 0 && e.id.length <= 40, "Eccezione non valida.");
      assert(isDayKey(e.startDate) && isDayKey(e.endDate), `Eccezione ${i + 1}: date non valide.`);
      assert(e.startDate <= e.endDate, `Eccezione ${i + 1}: «al» prima di «dal».`);
      const closed = Boolean(e.closed);
      const ranges = closed ? [] : parseRangesInput(e.ranges, `Eccezione ${i + 1}`);
      assert(closed || ranges.length > 0, `Eccezione ${i + 1}: indica gli orari oppure «chiuso».`);
      return { id: e.id, startDate: e.startDate, endDate: e.endDate, closed, ranges, note: parseText(e.note, "nota", { max: 120 }) };
    });
    return saveSetting("hours", "Orari", { showStatus: input.showStatus !== false, weekly, exceptions });
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
