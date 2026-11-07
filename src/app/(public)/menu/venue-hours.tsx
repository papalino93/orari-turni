"use client";

import { useEffect, useState } from "react";
import { romeNow, type Hours, type Range } from "@/lib/menu-venue";

const DAY_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

const rangesText = (ranges: Range[]) => (ranges.length ? ranges.map((x) => `${x.open}–${x.close}`).join(" · ") : "Chiuso");

// Le fasce orarie, ognuna intera: su un telefono stretto si va a capo tra una fascia e
// l'altra («10:00–13:00 ·» / «16:30–22:00»), mai dentro un orario («16:30–» / «22:00»).
function RangesText({ ranges }: { ranges: Range[] }) {
  if (!ranges.length) return <>Chiuso</>;
  return (
    <>
      {ranges.map((x, i) => (
        <span key={i}>
          <span className="whitespace-nowrap">
            {x.open}–{x.close}
            {i < ranges.length - 1 && " ·"}
          </span>
          {i < ranges.length - 1 && " "}
        </span>
      ))}
    </>
  );
}

function parts(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m: m - 1, d, weekday: (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 };
}

function addDays(key: string, days: number): string {
  const { y, m, d } = parts(key);
  return new Date(Date.UTC(y, m, d + days)).toISOString().slice(0, 10);
}

// «Lun 12 novembre», «Lun 12 – Mer 14 novembre», «Lun 30 novembre – Mar 1 dicembre».
function daysLabel(start: string, end: string): string {
  const a = parts(start);
  const b = parts(end);
  if (start === end) return `${DAY_SHORT[a.weekday]} ${a.d} ${MONTHS[a.m]}`;
  const first = a.m === b.m && a.y === b.y ? `${DAY_SHORT[a.weekday]} ${a.d}` : `${DAY_SHORT[a.weekday]} ${a.d} ${MONTHS[a.m]}`;
  return `${first} – ${DAY_SHORT[b.weekday]} ${b.d} ${MONTHS[b.m]}`;
}

// Orari della settimana a piè di pagina (giorni consecutivi con gli stessi orari in una riga,
// «Lun – Mar»), con la riga di oggi in evidenza, e sotto le chiusure e gli orari speciali dei
// prossimi 14 giorni (ferie, festivi). «Oggi» si calcola sull'orologio del telefono: la pagina è in cache.
export function VenueHours({ hours, dayKey }: { hours: Hours; dayKey: string }) {
  const [today, setToday] = useState(dayKey);
  const [known, setKnown] = useState(false);

  useEffect(() => {
    const update = () => {
      setToday(romeNow(new Date()).dateKey);
      setKnown(true);
    };
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, []);

  const rows: { start: number; end: number; text: string; ranges: Range[] }[] = [];
  hours.weekly.forEach((ranges, i) => {
    const text = rangesText(ranges);
    const last = rows[rows.length - 1];
    if (last && last.text === text) last.end = i;
    else rows.push({ start: i, end: i, text, ranges });
  });
  const weekday = parts(today).weekday;
  const horizon = addDays(today, 13);
  const special = hours.exceptions
    .filter((e) => e.endDate >= today && e.startDate <= horizon)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const hasHours = rows.some((r) => r.text !== "Chiuso");
  if (!hasHours && special.length === 0) return null;

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="menu-sans text-[10px] uppercase tracking-[0.34em] text-[#E9DCC4]">Orari</div>
      <dl className="m-0 grid w-full grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[15px]">
        {rows.map((row) => {
          const isToday = known && weekday >= row.start && weekday <= row.end;
          return (
            <div key={row.start} className="contents">
              <dt className={`menu-sans self-baseline text-[12px] uppercase tracking-[0.14em] ${isToday ? "font-semibold text-[#F4EEE3]" : "text-[#F4EEE3]/90"}`}>
                {row.start === row.end ? DAY_SHORT[row.start] : `${DAY_SHORT[row.start]} – ${DAY_SHORT[row.end]}`}
                {isToday && " "}
                {isToday && <span className="ml-1 rounded-full bg-[#F4EEE3]/15 px-1.5 py-px text-[10px] tracking-[0.12em]">oggi</span>}
              </dt>
              <dd className={`m-0 self-baseline text-right text-[#F4EEE3] ${isToday ? "font-semibold" : ""}`}>
                <RangesText ranges={row.ranges} />
              </dd>
            </div>
          );
        })}
      </dl>
      {special.length > 0 && (
        <>
          <div className="menu-sans mt-2 text-[10px] uppercase tracking-[0.34em] text-[#E9DCC4]">
            {special.every((e) => e.closed) ? "Chiusure" : "Chiusure e orari speciali"}
          </div>
          <dl className="m-0 grid w-full grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[15px]">
            {special.map((e) => (
              <div key={e.id} className="contents">
                <dt className="menu-sans self-baseline text-[12px] uppercase tracking-[0.1em] text-[#F4EEE3]/90">{daysLabel(e.startDate, e.endDate)}</dt>
                <dd className="m-0 self-baseline text-right text-[#F4EEE3]">
                  {e.closed ? "Chiuso" : <RangesText ranges={e.ranges} />}
                  {e.note && <span className="italic text-[#F4EEE3]/90"> · {e.note}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}
