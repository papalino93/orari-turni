// «Aggiungi al calendario»: l'evento come file .ics (RFC 5545), che il telefono apre
// direttamente nel suo calendario. Puro, così si prova senza database.

type IcsPromo = {
  slug: string;
  title: string;
  body: string | null;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  startTime: string | null; // HH:MM
  endTime: string | null;
};

// Ora di Roma, con le regole dell'ora legale: senza, alcuni calendari spostano l'orario.
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Rome",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Righe lunghe spezzate (massimo 75 byte, le successive iniziano con uno spazio).
function fold(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length;
    if (bytes + size > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

// Giorno e ora «di Roma» trattati come numeri, senza fusi: solo per sommare giorni e ore.
function shift(date: string, time: string, addMinutes: number): { date: string; time: string } {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, hh, mm) + addMinutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`, time: `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}` };
}

const day = (date: string) => date.replace(/-/g, "");
const stamp = (date: string, time: string) => `${day(date)}T${time.replace(":", "")}00`;

export function promoIcs(promo: IcsPromo, { address, url, now = new Date() }: { address: string; url: string; now?: Date }): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//L'Angolo del Vino//Menu//IT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  if (promo.startTime) lines.push(...VTIMEZONE);
  lines.push(
    "BEGIN:VEVENT",
    `UID:${promo.slug}@langolodelvino`,
    `DTSTAMP:${now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
  );
  if (promo.startTime) {
    let end: { date: string; time: string };
    if (promo.endTime) {
      // «Dalle 21:00 alle 01:00»: la fine è il giorno dopo.
      end = { date: promo.endDate, time: promo.endTime };
      if (promo.endDate === promo.startDate && promo.endTime <= promo.startTime) end = shift(promo.endDate, promo.endTime, 24 * 60);
    } else if (promo.endDate === promo.startDate) {
      end = shift(promo.startDate, promo.startTime, 3 * 60); // senza fine: tre ore
    } else {
      end = { date: promo.endDate, time: "23:59" };
    }
    lines.push(`DTSTART;TZID=Europe/Rome:${stamp(promo.startDate, promo.startTime)}`, `DTEND;TZID=Europe/Rome:${stamp(end.date, end.time)}`);
  } else {
    // Tutto il giorno: la fine è il giorno dopo l'ultimo (esclusa).
    lines.push(`DTSTART;VALUE=DATE:${day(promo.startDate)}`, `DTEND;VALUE=DATE:${day(shift(promo.endDate, "00:00", 24 * 60).date)}`);
  }
  lines.push(`SUMMARY:${escapeText(`${promo.title} · L'Angolo del Vino`)}`);
  if (address.trim()) lines.push(`LOCATION:${escapeText(address.trim())}`);
  lines.push(`DESCRIPTION:${escapeText([promo.body?.trim(), url].filter(Boolean).join("\n\n"))}`, `URL:${url}`, "END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
