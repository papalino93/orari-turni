"use client";

// «Numeri» (dal menù «⋯»): richieste dal sito e prenotazioni segnate a mano, ultimi 90 giorni.

import { peopleText, SOURCE_LABEL } from "@/lib/booking/rules";
import { Sheet } from "../gestione-menu/sheet";
import { duration } from "./format";
import { Empty } from "./lists";
import type { BookingStatsData } from "./types";

export function NumbersSheet({ stats, onClose }: { stats: BookingStatsData; onClose: () => void }) {
  return (
    <Sheet title="Numeri delle prenotazioni" wide onClose={onClose}>
      <p className="-mt-2 mb-4 text-sm text-foreground-muted">Ultimi 90 giorni, senza le prove.</p>
      <Numbers stats={stats} />
    </Sheet>
  );
}

function Numbers({ stats }: { stats: BookingStatsData }) {
  if (!stats.total && !stats.manual.total) {
    return <Empty title="Ancora nessun numero" text="Qui vedrai quante richieste arrivano dal sito, quante prenotazioni segnate a mano e da dove arrivano (ultimi 90 giorni, senza le prove)." />;
  }
  const pct = (n: number) => (stats.total ? `${Math.round((n / stats.total) * 100)}%` : "—");
  // Le note si spezzano solo ai «·»: niente «di persona · 0» con «persone» a capo da solo.
  const tiles: { label: string; value: string; note: string[] }[] = [
    { label: "Richieste online", value: String(stats.total), note: ["dal sito", "ultimi 90 giorni"] },
    { label: "Confermate online", value: String(stats.confirmed), note: [pct(stats.confirmed), peopleText(stats.people)] },
    { label: "Al completo", value: String(stats.declined), note: [pct(stats.declined)] },
    { label: "Segnate a mano", value: String(stats.manual.total), note: [peopleText(stats.manual.people), "non dal sito"] },
    { label: "Annullate", value: String(stats.cancelled + stats.manual.cancelled), note: stats.manual.cancelled ? [`${stats.cancelled} online`, `${stats.manual.cancelled} a mano`] : [pct(stats.cancelled)] },
    { label: "Non venuti", value: String(stats.noShow), note: ["prenotati, mai arrivati"] },
    { label: "Risposta tipica", value: stats.medianResponseMinutes === null ? "—" : duration(stats.medianResponseMinutes), note: ["alle richieste dal sito"] },
  ];
  const max = Math.max(...stats.bySource.map(([, n]) => n), 1);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">{t.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{t.value}</p>
            <p className="mt-0.5 text-xs text-foreground-muted">
              {t.note.map((part, i) => (
                <span key={i}>
                  <span className="whitespace-nowrap">
                    {part}
                    {i < t.note.length - 1 && " ·"}
                  </span>{" "}
                </span>
              ))}
            </p>
          </div>
        ))}
      </div>
      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Da dove arrivano</h2>
        <ul className="mt-3 space-y-2">
          {stats.bySource.map(([source, n]) => (
            <li key={source} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3 text-sm">
              <span className="truncate text-foreground">{SOURCE_LABEL[source] ?? "Link diretto"}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full rounded-full bg-chart" style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="text-right tabular-nums text-foreground-muted">{n}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

