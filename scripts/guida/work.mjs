// Cartella di lavoro della guida (foto, pagine, PDF intermedi): fuori da git.
import { cpSync, mkdirSync } from "node:fs";
export const WORK = new URL("../../.tmp-guida", import.meta.url).pathname;
mkdirSync(`${WORK}/img`, { recursive: true });
mkdirSync(`${WORK}/jpg`, { recursive: true });
// Sfondi, logo, QR e locandine vere: da scripts/guida/assets.
cpSync(new URL("./assets", import.meta.url).pathname, `${WORK}/jpg`, { recursive: true });
