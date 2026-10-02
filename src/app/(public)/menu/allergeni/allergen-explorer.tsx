"use client";

import { useState } from "react";
import { ALLERGENS, allergenLabel, type AllergenState } from "@/lib/allergens";

export type ExplorerItem = {
  id: string;
  name: string;
  description: string | null;
  state: AllergenState;
  allergens: string[];
};
export type ExplorerSection = {
  id: string;
  title: string;
  groups: { id: string; title: string; items: ExplorerItem[] }[];
};

// Elenco dei piatti con i loro allergeni, e un filtro per chi deve evitarne
// qualcuno. Un piatto "da compilare" non risulta mai sicuro: resta segnalato.
export function AllergenExplorer({ sections }: { sections: ExplorerSection[] }) {
  const [avoid, setAvoid] = useState<string[]>([]);
  const toggle = (code: string) => setAvoid((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  return (
    <div>
      <div className="mt-10">
        <div className="menu-sans text-xs font-medium uppercase tracking-[0.2em] text-[#1F2621]">Devi evitare qualcosa?</div>
        <p className="mt-1 text-[15.5px] italic leading-normal text-[#5B605A]">
          Tocca gli allergeni da evitare: i piatti che li contengono si attenuano.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ALLERGENS.map((a) => {
            const on = avoid.includes(a.code);
            return (
              <button
                key={a.code}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(a.code)}
                className={`menu-sans min-h-11 rounded-full border px-4 text-[13px] font-medium transition-colors ${
                  on ? "!border-[#6B1020] bg-[#6B1020] text-[#F4EEE3]" : "bg-transparent text-[#3F4540]"
                }`}
              >
                {a.label}
              </button>
            );
          })}
        </div>
        {avoid.length > 0 && (
          <button
            type="button"
            onClick={() => setAvoid([])}
            className="menu-sans mt-2 flex min-h-11 items-center text-[11px] font-medium uppercase tracking-[0.22em] text-[#6B1020] underline underline-offset-4"
          >
            Azzera la selezione
          </button>
        )}
      </div>

      {sections.map((section) => (
        <section key={section.id} className="mt-12">
          <h2 className="menu-serif m-0 text-center text-[34px] font-medium leading-[1.1] text-[#6B1020]">{section.title}</h2>
          {section.groups.map((group) => (
            <div key={group.id} className="mt-6">
              <div className="flex items-end gap-2.5 pb-2">
                <div className="menu-sans flex-initial text-xs font-medium uppercase leading-normal tracking-[0.2em] text-[#1F2621]">
                  {group.title}
                </div>
                <div className="mb-2 h-px min-w-3 flex-1 bg-[#D9CEBC]" />
              </div>
              {group.items.map((item) => {
                const hits = item.state === "some" ? item.allergens.filter((c) => avoid.includes(c)) : [];
                const conflict = hits.length > 0;
                return (
                  <div key={item.id} className="menu-rule-soft border-b py-3.5">
                    <div className={conflict ? "opacity-50" : ""}>
                      <div className="text-pretty text-[19px] font-medium leading-tight text-[#1F2621]">{item.name}</div>
                      {item.description && (
                        <div className="mt-0.5 text-pretty text-[15.5px] leading-[1.4] text-[#5B605A]">{item.description}</div>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {conflict ? (
                        <span className="menu-sans text-[12px] font-medium text-[#8A1A14]">
                          Contiene: {hits.map(allergenLabel).join(", ")}
                        </span>
                      ) : item.state === "unknown" ? (
                        <span className="menu-sans rounded-full bg-[#EFE0C2] px-2.5 py-1 text-[12px] font-medium text-[#6B4A12]">
                          Da verificare con il personale
                        </span>
                      ) : item.state === "none" ? (
                        <span className="menu-sans text-[12px] font-medium text-[#4A504B]">Nessun allergene</span>
                      ) : (
                        item.allergens.map((code) => (
                          <span key={code} className="menu-sans rounded-full bg-[#E9DFCE] px-2.5 py-1 text-[12px] font-medium text-[#3F4540]">
                            {allergenLabel(code)}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
