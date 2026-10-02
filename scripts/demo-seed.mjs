// Dati di prova realistici (nomi inventati) per provare e fotografare l'app in
// locale: dipendenti, turni di settembre/ottobre 2026, ferie, una chiusura, mesi
// inviati. Da lanciare DOPO scripts/menu-e2e/seed.mjs, solo su un database di prova.
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
const prisma = new PrismaClient();
const secret = process.env.NEXTAUTH_SECRET ?? "local-test-secret-not-for-production";
const enc = (plain) => {
  const key = crypto.scryptSync(secret, "orari-turni:employee-password:v1", 32);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const e = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), e]).toString("base64");
};
const EMP_PW = process.env.E2E_EMPLOYEE_PASSWORD;
const hired = new Date("2026-01-12T09:00:00Z");

await prisma.shiftBlock.deleteMany();
await prisma.leaveEntry.deleteMany();
await prisma.closureDay.deleteMany();
await prisma.weekPlan.deleteMany();
await prisma.monthlySubmission.deleteMany();
await prisma.employee.deleteMany({ where: { username: { notIn: ["francesco", "marta"] } } });

const cast = [
  { key: "andrea", name: "Andrea Ticonosco", role: "OWNER", jobTitle: "Titolare", username: null },
  { key: "giulia", name: "Giulia Bernardi", jobTitle: "Responsabile sala", username: "giulia" },
  { key: "marco", name: "Marco Fiorini", jobTitle: "Sala e mescita", username: "marco" },
  { key: "sara", name: "Sara Lombardi", jobTitle: "Cucina", username: "sara" },
  { key: "luca", name: "Luca Marchetti", jobTitle: "Sala", username: "luca" },
  { key: "elena", name: "Elena Costa", jobTitle: "Part-time weekend", username: "elena" },
];
const ids = {};
let order = 0;
for (const c of cast) {
  const e = await prisma.employee.create({
    data: { name: c.name, role: c.role ?? "EMPLOYEE", jobTitle: c.jobTitle, username: c.username, password: c.username ? enc(EMP_PW) : null, sortOrder: order++, createdAt: hired },
  });
  ids[c.key] = e.id;
}
for (const [u, name, job] of [["francesco", "Francesco Bianchi", "Cucina"], ["marta", "Marta Neri", "Sala"]]) {
  const e = await prisma.employee.update({ where: { username: u }, data: { name, jobTitle: job, createdAt: hired, sortOrder: order++ } });
  ids[u] = e.id;
}

// orari tipici per giorno della settimana (0=lun .. 6=dom)
const SPLIT = [["10:00", "13:00"], ["16:30", "22:00"]];
const day = (dow) => ({ 0: [["17:00", "21:30"]], 1: [["17:00", "21:30"]], 2: SPLIT, 3: [["10:00", "13:00"], ["16:30", "22:30"]], 4: SPLIT, 5: SPLIT, 6: [["16:30", "21:00"]] }[dow]);
const pattern = {
  andrea: [0, 1, 2, 3, 4, 5, 6],
  giulia: [2, 3, 4, 5],
  marco: [0, 1, 3, 4, 5],
  sara: [3, 4, 5, 6],
  luca: [1, 2, 4, 5, 6],
  elena: [5, 6],
  francesco: [0, 2, 3, 5],
  marta: [1, 2, 4, 6],
};
const start = new Date("2026-09-01T00:00:00Z");
const end = new Date("2026-10-11T00:00:00Z");
const blocks = [];
for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
  const dow = (d.getUTCDay() + 6) % 7;
  // chiusura 5 ottobre (lunedì), turni non generati
  if (d.toISOString().slice(0, 10) === "2026-10-05") continue;
  for (const [k, days] of Object.entries(pattern)) {
    if (!days.includes(dow)) continue;
    for (const [s, e] of day(dow)) {
      blocks.push({ employeeId: ids[k], date: new Date(d), startTime: s, endTime: e, confirmed: d < new Date("2026-10-02T00:00:00Z") });
    }
  }
}
// una correzione fatta dal dipendente a settembre
await prisma.shiftBlock.createMany({ data: blocks });
const luca = await prisma.shiftBlock.findFirst({ where: { employeeId: ids.luca, date: new Date("2026-09-11T00:00:00Z"), startTime: "16:30" } });
if (luca) await prisma.shiftBlock.update({ where: { id: luca.id }, data: { originalEndTime: luca.endTime, endTime: "22:45", editedByEmployeeAt: new Date("2026-10-01T10:00:00Z") } });
await prisma.shiftBlock.create({ data: { employeeId: ids.luca, date: new Date("2026-09-20T00:00:00Z"), startTime: "11:00", endTime: "13:00", addedByEmployee: true, editedByEmployeeAt: new Date("2026-10-01T10:05:00Z") } });

await prisma.closureDay.create({ data: { date: new Date("2026-10-05T00:00:00Z"), reason: "Chiusura per inventario", createdBy: "andrea" } });
await prisma.leaveEntry.createMany({
  data: [
    { employeeId: ids.luca, date: new Date("2026-10-08T00:00:00Z"), type: "FERIE", quantity: 1 },
    { employeeId: ids.luca, date: new Date("2026-10-09T00:00:00Z"), type: "FERIE", quantity: 1 },
    { employeeId: ids.elena, date: new Date("2026-10-01T00:00:00Z"), type: "MALATTIA", quantity: 0 },
    { employeeId: ids.marco, date: new Date("2026-10-02T00:00:00Z"), type: "LIBERO", quantity: 0 },
    { employeeId: ids.giulia, date: new Date("2026-10-06T00:00:00Z"), type: "PERMESSO", quantity: 3, note: "Visita medica" },
  ],
});
await prisma.weekPlan.createMany({ data: [
  { weekStart: new Date("2026-09-28T00:00:00Z"), publishedAt: new Date("2026-09-25T18:00:00Z"), publishedBy: "andrea" },
  { weekStart: new Date("2026-10-05T00:00:00Z"), publishedAt: null },
] });
const t = (iso) => new Date(iso);
await prisma.monthlySubmission.createMany({ data: [
  { employeeId: ids.giulia, year: 2026, month: 9, status: "SUBMITTED", submittedAt: t("2026-10-01T09:30:00Z") },
  { employeeId: ids.marco, year: 2026, month: 9, status: "APPROVED", submittedAt: t("2026-10-01T08:00:00Z"), approvedAt: t("2026-10-01T15:00:00Z"), approvedBy: "andrea" },
  { employeeId: ids.sara, year: 2026, month: 9, status: "REOPENED", submittedAt: t("2026-10-01T08:30:00Z"), reopenedAt: t("2026-10-01T16:00:00Z"), reopenNote: "Il 19 settembre risulti fino alle 22:00 ma abbiamo chiuso alle 21:30: controlla." },
  { employeeId: ids.luca, year: 2026, month: 9, status: "SUBMITTED", submittedAt: t("2026-10-01T10:10:00Z") },
] });
for (const k of ["giulia", "marco", "sara", "luca", "elena", "francesco", "marta"]) {
  await prisma.leaveBalance.upsert({ where: { employeeId_leaveType_year: { employeeId: ids[k], leaveType: "FERIE", year: 2026 } }, update: {}, create: { employeeId: ids[k], leaveType: "FERIE", year: 2026, openingBalance: 6, monthlyAccrualRate: 2.17, sourceNote: "da busta paga" } });
}
console.log("demo ok", blocks.length, "turni");
await prisma.$disconnect();
