import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// La password del dipendente è cifrata (AES-256-GCM), non hashata come
// quelle di titolare/consulente in User: il titolare deve poterla rileggere
// in ogni momento dalla scheda del dipendente per comunicarla a voce, non
// solo resettarla alla cieca. È una sicurezza minore rispetto a un hash —
// scelta deliberata per un tool interno, non una svista (vedi il piano di
// progetto "Area Dipendenti").
//
// La chiave si deriva da NEXTAUTH_SECRET (già configurato in produzione)
// invece di richiedere una variabile d'ambiente in più da non dimenticare
// di impostare — resta comunque distinta per uso grazie al "salt" fisso qui
// sotto, così un'eventuale futura rotazione di uno dei due non trascina
// anche l'altro.
const ALGORITHM = "aes-256-gcm";
const KEY_SALT = "orari-turni:employee-password:v1";

function getKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET non configurato: impossibile cifrare/decifrare le password dei dipendenti.");
  return crypto.scryptSync(secret, KEY_SALT, 32);
}

export function encryptEmployeePassword(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptEmployeePassword(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

// Parole del mondo del vino invece di stringhe a caso: facili da leggere al
// telefono e da ricordare, come richiesto. + 3 cifre casuali per non essere
// indovinabili da chi conosce solo il nome del dipendente.
const WINE_WORDS = [
  "Nebbiolo", "Sangiovese", "Barbera", "Trebbiano", "Vermentino", "Moscato",
  "Primitivo", "Malvasia", "Brunello", "Amarone", "Passito", "Grillo",
  "Chianti", "Barolo", "Riesling", "Falanghina", "Aglianico", "Cortese",
  "Verdicchio", "Nerello", "Cannonau", "Lambrusco", "Refosco", "Bonarda",
];

export function generateEmployeePassword(): string {
  const word = WINE_WORDS[Math.floor(Math.random() * WINE_WORDS.length)];
  const digits = String(Math.floor(100 + Math.random() * 900));
  return `${word}${digits}`;
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s.]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(".");
}

// "marco.rossi", e "marco.rossi2" in caso di doppione — univoco, generato
// da solo, ma il titolare può comunque riscriverlo a mano dalla scheda del
// dipendente.
export async function generateEmployeeUsername(name: string): Promise<string> {
  const base = slugify(name) || "dipendente";
  let candidate = base;
  let n = 1;
  while (await prisma.employee.findUnique({ where: { username: candidate } })) {
    n += 1;
    candidate = `${base}${n}`;
  }
  return candidate;
}
