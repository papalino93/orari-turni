"use server";

// Rubrica della pagina Mail: contatti, gruppi, importazione, eliminazione (con «Annulla») e
// cancellazione dei dati su richiesta. Solo titolare e consulente (requireUser rifiuta i
// dipendenti), con la sezione Mail accesa: lo ricontrolla ogni azione.

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { loadFeatures } from "@/lib/app-features";
import { addOptOut, isValidEmail } from "@/lib/mail";
import { ensureGroup, newContactId } from "@/lib/mail-contacts";
import { cleanEmail, cleanName, fold, isConsent, isGroupColor, isSource, longDay, tidyPhone, type Consent } from "@/lib/mail-rubrica";
import { parseId, parseText, runAction, ValidationError, type ActionResult } from "@/lib/validation";

const MAX_IMPORT = 500;
const MAX_BULK = 10000;

async function rubricaUser() {
  const user = await requireUser();
  if (!(await loadFeatures()).mail) throw new ValidationError("La sezione Mail è spenta: accendila da Impostazioni → «Mail».");
  return user;
}

function readIds(input: unknown, max = MAX_BULK): string[] {
  const list = Array.isArray(input) ? input : [];
  if (list.length === 0 || list.length > max) throw new ValidationError("Nessun contatto scelto.");
  return [...new Set(list.map((x) => parseId(x, "contatto")))];
}

async function readGroups(input: unknown): Promise<string[]> {
  const list = Array.isArray(input) ? [...new Set(input.map((x) => parseId(x, "gruppo")))] : [];
  if (list.length === 0) return [];
  const found = await prisma.mailGroup.findMany({ where: { id: { in: list } }, select: { id: true } });
  if (found.length !== list.length) throw new ValidationError("Un gruppo non c'è più: ricarica la pagina.");
  return list;
}

function readEmail(input: unknown): string {
  const email = cleanEmail(typeof input === "string" ? input : "");
  if (!email) throw new ValidationError("Scrivi l'email.");
  if (!isValidEmail(email)) throw new ValidationError("L'email non sembra giusta: controllala (es. nome@esempio.it).");
  return email;
}

const done = () => revalidatePath("/mail");

// ---------- Un contatto: nuovo o modificato

export type ContactInput = { id?: string; email: string; name: string; phone: string; notes: string; groups: string[]; consent: string };

export async function saveContact(input: ContactInput): Promise<ActionResult<{ id: string; revived: boolean }>> {
  return runAction(async () => {
    const user = await rubricaUser();
    const id = input?.id ? parseId(input.id, "contatto") : null;
    const email = readEmail(input?.email);
    const name = cleanName(parseText(input?.name, "nome", { max: 200 }));
    const phone = tidyPhone(parseText(input?.phone, "telefono", { max: 40 })) || null;
    const notes = parseText(input?.notes, "note", { max: 1000 }) || null;
    const groups = await readGroups(input?.groups);
    if (!isConsent(input?.consent)) throw new ValidationError("Scegli perché possiamo scrivergli.");
    const consent: Consent = input.consent;
    const who = user.name || user.username;

    const same = await prisma.mailContact.findUnique({ where: { email } });
    if (same && same.id !== id && !same.deletedAt) {
      throw new ValidationError(`${email} è già in rubrica${same.name ? ` («${same.name}»)` : ""}: cercalo nell'elenco.`);
    }

    if (id) {
      const cur = await prisma.mailContact.findUnique({ where: { id } });
      if (!cur || cur.deletedAt) throw new ValidationError("Questo contatto non c'è più: ricarica la pagina.");
      // Un contatto eliminato con la stessa email (si poteva ancora rimettere) lascia il posto.
      if (same && same.id !== id) await prisma.mailContact.delete({ where: { id: same.id } });
      await prisma.$transaction([
        prisma.mailContact.update({
          where: { id },
          data: {
            email,
            name,
            phone,
            notes,
            ...(consent !== cur.consent ? { consent, consentAt: new Date(), consentNote: `Cambiato a mano da ${who}` } : {}),
          },
        }),
        prisma.mailContactGroup.deleteMany({ where: { contactId: id, groupId: { notIn: groups } } }),
        prisma.mailContactGroup.createMany({ data: groups.map((groupId) => ({ contactId: id, groupId })), skipDuplicates: true }),
      ]);
      done();
      return { id, revived: false };
    }

    const data = { name, phone, notes, consent, consentAt: new Date(), consentNote: `Segnato a mano da ${who}` };
    const row = same
      ? await prisma.mailContact.update({ where: { id: same.id }, data: { ...data, deletedAt: null, source: "mano" } })
      : await prisma.mailContact.create({ data: { ...data, email, source: "mano" } });
    if (same) await prisma.mailContactGroup.deleteMany({ where: { contactId: row.id } });
    if (groups.length) await prisma.mailContactGroup.createMany({ data: groups.map((groupId) => ({ contactId: row.id, groupId })), skipDuplicates: true });
    done();
    return { id: row.id, revived: Boolean(same) };
  });
}

// ---------- Eliminare (si può annullare) e rimettere

export async function deleteContacts(input: { ids: string[] }): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    await rubricaUser();
    const ids = readIds(input?.ids);
    const res = await prisma.mailContact.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { deletedAt: new Date() } });
    done();
    return { count: res.count };
  });
}

export async function restoreContacts(input: { ids: string[] }): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    await rubricaUser();
    const ids = readIds(input?.ids);
    const res = await prisma.mailContact.updateMany({ where: { id: { in: ids }, deletedAt: { not: null } }, data: { deletedAt: null } });
    done();
    return { count: res.count };
  });
}

// «Elimina e non scrivergli più» (chi chiede di cancellare i suoi dati): via il contatto, i gruppi e
// lo storico delle mail ricevute; resta solo l'indirizzo tra chi non vuole più email, così nessun
// file o elenco lo rimette in lista. Non si può annullare.
export async function eraseContact(input: { id: string }): Promise<ActionResult<{ email: string }>> {
  return runAction(async () => {
    await rubricaUser();
    const id = parseId(input?.id, "contatto");
    const c = await prisma.mailContact.findUnique({ where: { id } });
    if (!c) throw new ValidationError("Questo contatto non c'è più: ricarica la pagina.");
    await addOptOut(c.email, "cancellazione");
    await prisma.$transaction([prisma.mailSendRecipient.deleteMany({ where: { email: c.email } }), prisma.mailContact.delete({ where: { id } })]);
    done();
    return { email: c.email };
  });
}

// «Non vuole più email» segnato dalla scheda del contatto (ha risposto «cancellami»).
export async function markContactOptOut(input: { id: string }): Promise<ActionResult<{ email: string }>> {
  return runAction(async () => {
    await rubricaUser();
    const c = await prisma.mailContact.findUnique({ where: { id: parseId(input?.id, "contatto") } });
    if (!c) throw new ValidationError("Questo contatto non c'è più: ricarica la pagina.");
    await addOptOut(c.email, "a mano");
    done();
    return { email: c.email };
  });
}

// ---------- Gruppi

export async function addToGroup(input: { ids: string[]; groupId: string }): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    await rubricaUser();
    const ids = readIds(input?.ids);
    const [groupId] = await readGroups([input?.groupId]);
    const res = await prisma.mailContactGroup.createMany({ data: ids.map((contactId) => ({ contactId, groupId })), skipDuplicates: true });
    done();
    return { count: res.count };
  });
}

export async function removeFromGroup(input: { ids: string[]; groupId: string }): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    await rubricaUser();
    const ids = readIds(input?.ids);
    const groupId = parseId(input?.groupId, "gruppo");
    const res = await prisma.mailContactGroup.deleteMany({ where: { groupId, contactId: { in: ids } } });
    done();
    return { count: res.count };
  });
}

export async function saveGroup(input: { id?: string; name: string; color: string }): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    await rubricaUser();
    const id = input?.id ? parseId(input.id, "gruppo") : null;
    const name = cleanName(parseText(input?.name, "nome del gruppo", { max: 40 }));
    if (!name) throw new ValidationError("Scrivi il nome del gruppo.");
    const color = isGroupColor(input?.color) ? input.color : "vino";
    const same = await prisma.mailGroup.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } });
    if (same) throw new ValidationError(`C'è già un gruppo «${same.name}».`);
    if (id) {
      await prisma.mailGroup.update({ where: { id }, data: { name, color } });
      done();
      return { id };
    }
    const last = await prisma.mailGroup.aggregate({ _max: { sortOrder: true } });
    const g = await prisma.mailGroup.create({ data: { name, color, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    done();
    return { id: g.id };
  });
}

// Eliminare un gruppo non elimina i contatti: escono solo dal gruppo.
export async function deleteGroup(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    await rubricaUser();
    await prisma.mailGroup.deleteMany({ where: { id: parseId(input?.id, "gruppo") } });
    done();
  });
}

// ---------- Importazione (a pezzi da 500: il browser spezza l'elenco)

// groups: i gruppi scritti nel file per questa persona (per nome: quelli che mancano si creano).
export type ImportItem = { email: string; name: string; phone: string; updateName: boolean; groups?: string[] };

// Nuovi: entrano con il motivo dichiarato. Già in rubrica: si riempiono nome e telefono se
// mancano; il nome si cambia solo se l'ha chiesto chi importa (updateName). Un contatto eliminato
// torna. Chi non vuole più email non entra mai (e non torna attivo).
export async function importContacts(input: {
  items: ImportItem[];
  groups: string[];
  consent: string;
  source: string;
}): Promise<ActionResult<{ added: number; updated: number; skipped: number }>> {
  return runAction(async () => {
    const user = await rubricaUser();
    const list = Array.isArray(input?.items) ? input.items : [];
    if (list.length === 0 || list.length > MAX_IMPORT) throw new ValidationError("Elenco da importare non valido.");
    if (!isConsent(input?.consent)) throw new ValidationError("Scegli perché puoi scrivere a queste persone.");
    const consent: Consent = input.consent;
    const source = isSource(input?.source) ? input.source : "file";
    const groups = await readGroups(input?.groups);
    const seen = new Set<string>();
    const items = list
      .map((it) => ({
        email: cleanEmail(typeof it?.email === "string" ? it.email : ""),
        name: cleanName(typeof it?.name === "string" ? it.name : ""),
        phone: typeof it?.phone === "string" ? tidyPhone(it.phone) : "",
        updateName: it?.updateName === true,
        groups: Array.isArray(it?.groups) ? it.groups.filter((g): g is string => typeof g === "string").map((g) => cleanName(g).slice(0, 40)).filter(Boolean).slice(0, 20) : [],
      }))
      .filter((it) => isValidEmail(it.email) && !seen.has(it.email) && seen.add(it.email));
    const emails = items.map((it) => it.email);
    const [existing, outs] = await Promise.all([
      prisma.mailContact.findMany({ where: { email: { in: emails } } }),
      prisma.mailOptOut.findMany({ where: { email: { in: emails } }, select: { email: true } }),
    ]);
    const byEmail = new Map(existing.map((c) => [c.email, c]));
    // Gruppi del file: quelli che non ci sono ancora si creano (mostrati prima nell'anteprima).
    const fileGroupNames = new Map<string, string>();
    for (const it of items) for (const g of it.groups) if (!fileGroupNames.has(fold(g))) fileGroupNames.set(fold(g), g);
    if (fileGroupNames.size > 50) throw new ValidationError("Nel file ci sono più di 50 gruppi diversi: controlla la colonna «Gruppo».");
    const groupId = new Map<string, string>();
    for (const [k, name] of fileGroupNames) groupId.set(k, await ensureGroup(name));
    const links: { contactId: string; groupId: string }[] = [];
    const link = (contactId: string, names: string[]) => {
      for (const gid of groups) links.push({ contactId, groupId: gid });
      for (const g of names) links.push({ contactId, groupId: groupId.get(fold(g))! });
    };
    const out = new Set(outs.map((o) => o.email));
    const now = new Date();
    const consentNote = `Dichiarato importando, il ${longDay(now.toISOString())} (${user.name || user.username})`;
    let added = 0;
    let updated = 0;
    let skipped = 0;
    const fresh: { id: string; email: string; name: string; phone: string | null }[] = [];
    for (const it of items) {
      if (out.has(it.email)) {
        skipped++;
        continue;
      }
      const cur = byEmail.get(it.email);
      if (!cur) {
        const id = newContactId();
        fresh.push({ id, email: it.email, name: it.name, phone: it.phone || null });
        link(id, it.groups);
        continue;
      }
      link(cur.id, it.groups);
      const data: { name?: string; phone?: string; deletedAt?: null; consent?: Consent; consentAt?: Date; consentNote?: string } = {};
      if (it.name && (!cur.name.trim() || (it.updateName && it.name !== cur.name))) data.name = it.name;
      if (it.phone && !cur.phone) data.phone = it.phone;
      // Un contatto eliminato e reimportato riparte con il motivo dichiarato ora.
      if (cur.deletedAt) Object.assign(data, { deletedAt: null, consent, consentAt: now, consentNote });
      if (Object.keys(data).length) {
        await prisma.mailContact.update({ where: { id: cur.id }, data });
        if (cur.deletedAt) added++;
        else updated++;
      }
    }
    if (fresh.length) {
      const res = await prisma.mailContact.createMany({
        data: fresh.map((f) => ({ ...f, source, consent, consentAt: now, consentNote })),
        skipDuplicates: true,
      });
      added += res.count;
    }
    if (links.length) await prisma.mailContactGroup.createMany({ data: links, skipDuplicates: true });
    done();
    return { added, updated, skipped };
  });
}

// ---------- «Invii»: a chi è andato un invio

export async function sendPeople(input: { id: string }): Promise<ActionResult<{ email: string; name: string; status: string }[]>> {
  return runAction(async () => {
    await requireUser();
    const sendId = parseId(input?.id, "invio");
    const rows = await prisma.mailSendRecipient.findMany({ where: { sendId }, orderBy: [{ status: "desc" }, { email: "asc" }], take: 5000 });
    const names = await prisma.mailContact.findMany({ where: { email: { in: rows.map((r) => r.email) } }, select: { email: true, name: true } });
    const byEmail = new Map(names.map((c) => [c.email, c.name]));
    return rows.map((r) => ({ email: r.email, name: byEmail.get(r.email) ?? "", status: r.status }));
  });
}

