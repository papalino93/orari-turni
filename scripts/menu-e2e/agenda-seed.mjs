// Dati di prova per l'agenda a calendario (prenota-calendario.mjs, foto): tutto con id «agv_…».
// - un giorno con 120 prenotazioni (orari pari e dispari, dopo mezzanotte, allergie, senza telefono,
//   menù, 3 incomplete, 4 richieste online da confermare, 2 prove, 1 annullata), con evento del menù,
//   nota del giorno, turni e ferie;
// - una settimana normale da oggi, un mese sparso, richieste chiuse un giorno, un giorno chiuso;
// - le settimane del cambio d'ora (ora legale 28 marzo 2027, ora solare 25 ottobre 2026).
// Uso: node scripts/menu-e2e/agenda-seed.mjs seed|clean   (oppure import { seedAgenda, cleanAgendaSeed })
import { DB, q } from "./prenota-lib.mjs";

const T = () => DB(`select to_char(((now() at time zone 'Europe/Rome') - interval '5 hours')::date, 'YYYY-MM-DD')`);
export const addDays = (key, n) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

export function cleanAgendaSeed() {
  DB(`delete from "BookingRequest" where id like 'agv\\_%'`);
  DB(`delete from "MenuPromo" where id like 'agv\\_%'`);
  DB(`delete from "BookingDayNote" where id like 'agv\\_%' or text like '%(prova agv)%'`);
  DB(`delete from "BookingRequest" where name like 'Agv %' or name like 'Agv Servizio%'`);
  DB(`delete from "ShiftBlock" where id like 'agv\\_%'`);
  DB(`delete from "LeaveEntry" where id like 'agv\\_%'`);
  DB(`delete from "ClosureDay" where id like 'agv\\_%'`);
  DB(`delete from "BookingClosedDay" where reason = 'Prova agv' or "createdBy" = 'Prova agv'`);
}

const FIRST = ["Rossi", "Bianchi", "Verdi", "Neri", "Russo", "Ferrari", "Esposito", "Romano", "Colombo", "Ricci", "Marino", "Greco", "Bruno", "Gallo", "Conti", "De Luca", "Mancini", "Costa", "Giordano", "Rizzo", "Lombardi", "Moretti", "Barbieri", "Fontana", "Santoro", "Mariani", "Rinaldi", "Caruso", "Ferrara", "Galli"];
const NAMES = ["Marco", "Giulia", "Luca", "Sara", "Paolo", "Elena", "Andrea", "Chiara", "Davide", "Anna", "Matteo", "Francesca"];
const NOTES = ["compleanno", "seggiolone", "vicino alla finestra", "anniversario, torta alle 22", "tavolo tranquillo", "arrivano in due tempi", "cane piccolo", null, null, null, null, null];
const MENUS = ["Menù da 25 €", "Menù degustazione", null, null, null, null, null, null];

let n = 0;
function row(over) {
  n++;
  const id = over.id ?? `agv_${String(n).padStart(4, "0")}`;
  const time = over.time ?? "20:00";
  const timeUnknown = over.timeUnknown ?? false;
  const peopleUnknown = over.peopleUnknown ?? false;
  const v = {
    id,
    code: `AV${String(n).padStart(4, "0")}`,
    tokenHash: `agv_tok_${id}`,
    status: over.status ?? "CONFIRMED",
    day: over.day,
    time: timeUnknown ? "" : time,
    people: peopleUnknown ? 0 : (over.people ?? 2),
    name: over.name ?? `${NAMES[n % NAMES.length]} ${FIRST[n % FIRST.length]}`,
    phone: over.phone ?? `39333${String(1000000 + n).slice(-7)}`,
    contact: "whatsapp",
    note: over.note ?? null,
    allergies: over.allergies ?? false,
    source: over.source ?? "telefono",
    manual: over.manual ?? true,
    isTest: over.isTest ?? false,
    createdBy: over.manual === false ? null : (over.createdBy ?? "Marta"),
    handledBy: over.manual === false ? null : "Marta",
    tableLabel: over.table ?? null,
    menu: over.menu ?? null,
    timeUnknown,
    peopleUnknown,
  };
  const startsAt = timeUnknown
    ? `('${v.day} 05:00'::timestamp at time zone 'Europe/Rome')`
    : `(('${v.day} ${time}'::timestamp + case when '${time}' < '05:00' then interval '1 day' else interval '0' end) at time zone 'Europe/Rome')`;
  const cols = Object.keys(v).map((c) => `"${c}"`).join(", ");
  const vals = Object.values(v).map((x) => (x === null ? "null" : typeof x === "number" || typeof x === "boolean" ? String(x) : q(x))).join(", ");
  return { cols, sql: `(${vals}, ${startsAt}, now() - interval '${n % 600} seconds', now())` };
}
function insert(rows) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += 60) {
    const part = rows.slice(i, i + 60);
    DB(`insert into "BookingRequest" (${part[0].cols}, "startsAt", "createdAt", "updatedAt") values ${part.map((r) => r.sql).join(", ")}`);
  }
}

// Restituisce i giorni usati (per le prove).
export function seedAgenda() {
  cleanAgendaSeed();
  n = 0;
  const today = T();
  const BIG = addDays(today, 3);
  const FULLREQ = addDays(today, 4);
  const CLOSED = addDays(today, 5);
  const rows = [];

  // ---- Giorno grande: 120 prenotazioni
  const times = ["18:30", "19:00", "19:00", "19:30", "19:30", "20:00", "20:00", "20:00", "20:15", "20:30", "20:30", "20:30", "20:45", "21:00", "21:00", "21:15", "21:30", "22:00", "22:30", "23:00"];
  for (let i = 0; i < 112; i++) {
    rows.push(
      row({
        day: BIG,
        time: times[i % times.length],
        people: 2 + (i % 5),
        note: NOTES[i % NOTES.length],
        allergies: i % 13 === 0,
        menu: MENUS[i % MENUS.length],
        phone: i % 17 === 5 ? "" : undefined,
        table: i % 9 === 0 ? String(1 + (i % 20)) : null,
        source: ["telefono", "whatsapp", "persona", "librone"][i % 4],
      }),
    );
  }
  rows.push(row({ id: "agv_notte1", day: BIG, time: "00:30", people: 4, name: "Agv Nottambuli" }));
  rows.push(row({ id: "agv_notte2", day: BIG, time: "01:00", people: 2, name: "Agv Ultimo giro" }));
  rows.push(row({ id: "agv_inc_time", day: BIG, timeUnknown: true, people: 6, name: "Agv Arianna", phone: "393661234567", menu: "Menù da 25 €" }));
  rows.push(row({ id: "agv_inc_both", day: BIG, timeUnknown: true, peopleUnknown: true, name: "Agv Dainelli", note: "evento aziendale" }));
  rows.push(row({ id: "agv_inc_people", day: BIG, time: "21:00", peopleUnknown: true, name: "Agv Famiglia Conti" }));
  for (let i = 0; i < 4; i++) rows.push(row({ id: `agv_pend${i}`, day: BIG, time: ["19:30", "20:30", "21:00", "21:30"][i], people: 3 + i, status: "PENDING", manual: false, source: "google", name: `Agv Richiesta ${i + 1}` }));
  rows.push(row({ id: "agv_test1", day: BIG, time: "20:00", people: 9, isTest: true, name: "Agv Prova uno" }));
  rows.push(row({ id: "agv_test2", day: BIG, time: "20:30", people: 7, isTest: true, name: "Agv Prova due" }));
  rows.push(row({ id: "agv_canc", day: BIG, time: "20:00", people: 5, status: "CANCELLED", name: "Agv Annullata" }));
  rows.push(row({ id: "agv_allergia", day: BIG, time: "19:00", people: 3, allergies: true, name: "Agv Allergici", note: "celiaco al tavolo" }));
  rows.push(row({ id: "agv_senzatel", day: BIG, time: "19:30", people: 2, phone: "", name: "Agv Senza numero" }));
  rows.push(row({ id: "agv_menu", day: BIG, time: "20:00", people: 4, name: "Agv Con menù", menu: "Menù degustazione" }));

  // ---- Settimana normale (da oggi) e mese sparso
  for (let d = 0; d < 7; d++) {
    const day = addDays(today, d);
    if (day === BIG || day === CLOSED) continue;
    const count = [6, 12, 4, 0, 18, 0, 9][d];
    for (let i = 0; i < count; i++) rows.push(row({ day, time: ["19:00", "19:30", "20:00", "20:30", "21:00", "21:30"][i % 6], people: 2 + (i % 4), allergies: i === 2, menu: i === 1 ? "Menù da 25 €" : null }));
  }
  for (let d = 8; d < 36; d += 3) for (let i = 0; i < (d % 4) + 2; i++) rows.push(row({ day: addDays(today, d), time: "20:30", people: 2 + i }));
  rows.push(row({ id: "agv_month_inc", day: addDays(today, 11), timeUnknown: true, people: 8, name: "Agv Cena di classe" }));
  // Oggi: qualcuno già arrivato, qualcuno dopo (per la linea «adesso»).
  rows.push(row({ id: "agv_oggi1", day: today, time: "18:00", people: 2, name: "Agv Oggi presto" }));
  rows.push(row({ id: "agv_oggi2", day: today, time: "22:30", people: 4, name: "Agv Oggi tardi" }));
  rows.push(row({ id: "agv_oggi_inc", day: today, timeUnknown: true, people: 3, name: "Agv Oggi senza ora" }));

  // ---- Cambio d'ora
  rows.push(row({ id: "agv_dst_sab", day: "2027-03-27", time: "20:30", people: 2, name: "Agv Ora legale sabato" }));
  rows.push(row({ id: "agv_dst_dom", day: "2027-03-28", time: "20:30", people: 4, name: "Agv Ora legale domenica" }));
  rows.push(row({ id: "agv_dst_notte", day: "2027-03-28", time: "00:30", people: 3, name: "Agv Ora legale notte" }));
  rows.push(row({ id: "agv_dst_lun", day: "2027-03-29", time: "19:00", people: 2, name: "Agv Ora legale lunedì" }));
  rows.push(row({ id: "agv_solare", day: "2026-10-25", time: "20:00", people: 5, name: "Agv Ora solare" }));
  rows.push(row({ id: "agv_solare_notte", day: "2026-10-25", time: "01:30", people: 2, name: "Agv Ora solare notte" }));
  insert(rows);

  // ---- Evento del menù, nota del giorno, richieste chiuse, giorno chiuso, turni
  DB(
    `insert into "MenuPromo" (id, kind, slug, title, label, "showFrom", "startDate", "endDate", "startTime", "updatedAt") values ('agv_evento', 'EVENT', 'agv-degustazione-brunello', 'Degustazione Brunello', 'Degustazione', ${q(addDays(today, -10))}, ${q(BIG)}, ${q(BIG)}, '19:00', now())`,
  );
  DB(`insert into "BookingDayNote" (id, day, text, author, "updatedAt") values ('agv_nota1', ${q(BIG)}, 'EVENTO DAINELLI · sala piccola riservata', 'Andrea', now())`);
  DB(`insert into "BookingClosedDay" (day, reason, "createdBy") values (${q(FULLREQ)}, 'Prova agv', 'Prova agv') on conflict (day) do nothing`);
  const closedExists = DB(`select count(*) from "ClosureDay" where date = ${q(CLOSED)}::date`) !== "0";
  if (!closedExists) DB(`insert into "ClosureDay" (id, date, reason, "createdBy") values ('agv_chiuso', ${q(CLOSED)}::date, 'Inventario', 'Prova agv')`);
  const emps = DB(`select id from "Employee" where active and role='EMPLOYEE' order by "sortOrder", name limit 4`).split("\n").filter(Boolean);
  const shifts = [["17:00", "23:30"], ["18:00", "01:00"], ["10:00", "13:00"], ["16:30", "22:00"]];
  emps.slice(0, 3).forEach((e, i) => DB(`insert into "ShiftBlock" (id, "employeeId", date, "startTime", "endTime", "updatedAt") values ('agv_turno${i}', ${q(e)}, ${q(BIG)}::date, ${q(shifts[i][0])}, ${q(shifts[i][1])}, now())`));
  if (emps[2]) DB(`insert into "ShiftBlock" (id, "employeeId", date, "startTime", "endTime", "updatedAt") values ('agv_turno9', ${q(emps[2])}, ${q(BIG)}::date, '16:30', '22:00', now())`);
  if (emps[3]) DB(`insert into "LeaveEntry" (id, "employeeId", date, type, quantity) values ('agv_ferie', ${q(emps[3])}, ${q(BIG)}::date, 'FERIE', 1) on conflict ("employeeId", date) do nothing`);
  return { today, BIG, FULLREQ, CLOSED, closedSeeded: !closedExists, employees: emps.length };
}

if (process.argv[1] && process.argv[1].endsWith("agenda-seed.mjs")) {
  const what = process.argv[2];
  if (what === "seed") console.log(JSON.stringify(seedAgenda()));
  else if (what === "clean") cleanAgendaSeed();
  else console.log("Uso: node scripts/menu-e2e/agenda-seed.mjs seed|clean");
}
