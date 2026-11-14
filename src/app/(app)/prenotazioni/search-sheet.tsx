"use client";

// «Cerca» (dal menù «⋯»): una prenotazione per nome, telefono, codice o menù, anche tra le passate.
// Senza testo mostra le ultime passate, annullate e al completo (era la scheda «Archivio»).

import { useEffect, useState } from "react";
import { Sheet, inputClass } from "../gestione-menu/sheet";
import { CardList, Empty, RequestCard, SearchIcon } from "./lists";
import type { BookingItem } from "./types";

export function SearchSheet({ rows, archive, now, today, onOpen, onClose }: { rows: BookingItem[]; archive: BookingItem[]; now: number; today: string; onOpen: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<{ q: string; results: BookingItem[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) return;
    let alive = true;
    const t = setTimeout(() => {
      fetch(`/prenotazioni/agenda?cerca=${encodeURIComponent(q)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { results?: BookingItem[] }) => {
          if (!alive) return;
          setFailed(false);
          setRemote({ q, results: j.results ?? [] });
        })
        .catch(() => alive && setFailed(true));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  // Subito quelle già nella pagina (ultimi 30 giorni e prossime), poi tutte dal server.
  const lower = q.toLowerCase();
  const digits = q.replace(/\D/g, "");
  const local = q.length >= 2 ? rows.filter((b) => b.name.toLowerCase().includes(lower) || b.code.toLowerCase() === lower || (b.menu ?? "").toLowerCase().includes(lower) || (b.note ?? "").toLowerCase().includes(lower) || (digits.length >= 3 && b.phone.includes(digits))) : [];
  const results = remote && remote.q === q ? remote.results : local;
  const loading = q.length >= 2 && (!remote || remote.q !== q) && !failed;

  return (
    <Sheet title="Cerca una prenotazione" onClose={onClose}>
      <div className="space-y-4" data-unsaved-ignore data-testid="cerca">
        <label className="relative block">
          <span className="sr-only">Cerca per nome, telefono o menù</span>
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground-muted" />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nome, telefono o menù"
            className={`${inputClass} rounded-full! pl-10`}
          />
        </label>
        {q.length < 2 ? (
          archive.length ? (
            <section aria-labelledby="passate-titolo">
              <h3 id="passate-titolo" className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                Passate, annullate o rifiutate · ultimi 30 giorni
              </h3>
              <CardList single>
                {archive.map((b) => (
                  <RequestCard key={b.id} b={b} now={now} today={today} onOpen={onOpen} showStatus />
                ))}
              </CardList>
            </section>
          ) : (
            <p className="px-1 text-sm text-foreground-muted">Scrivi almeno due lettere: cerco in tutte le prenotazioni, anche in quelle passate.</p>
          )
        ) : (
          <section aria-label="Risultati della ricerca" aria-busy={loading}>
            <p className="mb-2 px-1 text-xs text-foreground-muted" aria-live="polite">
              {failed ? "Non riesco a cercare tra le passate: controlla la connessione." : loading && !results.length ? "Cerco…" : results.length ? `${results.length} ${results.length === 1 ? "trovata" : "trovate"}` : ""}
            </p>
            {results.length ? (
              <CardList single>
                {results.map((b) => (
                  <RequestCard key={b.id} b={b} now={now} today={today} onOpen={onOpen} showStatus />
                ))}
              </CardList>
            ) : (
              !loading && !failed && <Empty title="Nessuna prenotazione trovata" text={`Niente per «${q}». Prova con il cognome o le ultime cifre del telefono.`} />
            )}
          </section>
        )}
      </div>
    </Sheet>
  );
}
