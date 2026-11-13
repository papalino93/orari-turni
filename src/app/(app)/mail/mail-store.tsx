"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { compareContacts, searchKey, type RContact, type RubricaData } from "@/lib/mail-rubrica";

// Pagina Mail: le tre schede («Scrivi», «Rubrica», «Invii»), la rubrica letta una volta e
// condivisa (scheda «Rubrica» e «Dalla rubrica» al passo 1), e il ponte tra le due: «Scrivi a
// questi» porta i contatti scelti nella rubrica al passo 1 dell'invio.

export type Tab = "scrivi" | "rubrica" | "invii";
export type Mode = "rubrica" | "tabella" | "file" | "incolla";

// Un contatto con la sua chiave di ricerca (senza accenti) e le cifre del telefono, calcolate una volta.
export type Indexed = { c: RContact; key: string; digits: string };

type Store = {
  tab: Tab;
  setTab: (t: Tab) => void;
  // Rubrica
  data: RubricaData | null;
  index: Indexed[];
  byEmail: Map<string, RContact>;
  loading: boolean;
  loadError: string | null;
  ensureLoaded: () => void;
  reload: () => Promise<void>;
  contactCount: number;
  // Passo 1 dell'invio
  mode: Mode;
  setMode: (m: Mode) => void;
  step: number;
  setStep: (s: number) => void;
  picked: Set<string>;
  setPicked: (next: Set<string>) => void;
  // Cambia a ogni «Scrivi a questi»: un invio finito prima non resta sullo schermo.
  writeNonce: number;
  writeTo: (ids: string[]) => void;
};

const Ctx = createContext<Store | null>(null);

export function useMail(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useMail fuori da MailProvider");
  return s;
}

const TYPED_KEY = "mail-destinatari-scritti";
const hasTypedDraft = () => {
  try {
    return Boolean(sessionStorage.getItem(TYPED_KEY));
  } catch {
    return false;
  }
};
const noSubscribe = () => () => {};

export function MailProvider({ initialTab, contactCount, children }: { initialTab: Tab; contactCount: number; children: ReactNode }) {
  const [tab, setTabState] = useState<Tab>(initialTab);
  const [data, setData] = useState<RubricaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chosenMode, setMode] = useState<Mode | null>(null);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [writeNonce, setWriteNonce] = useState(0);
  const typedDraft = useSyncExternalStore(noSubscribe, hasTypedDraft, () => false);
  const seq = useRef(0);

  // Con qualcuno in rubrica si parte da lì; con un elenco scritto a mano lasciato a metà, da quello.
  const mode: Mode = chosenMode ?? (typedDraft || contactCount === 0 ? "tabella" : "rubrica");

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    // La scheda resta nell'indirizzo (ricaricando si torna lì) senza ricaricare la pagina.
    const url = new URL(window.location.href);
    if (t === "scrivi") url.searchParams.delete("scheda");
    else url.searchParams.set("scheda", t);
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const res = await fetch("/mail/contatti", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as RubricaData;
      if (mine === seq.current) {
        setData(next);
        setLoadError(null);
      }
    } catch {
      if (mine === seq.current) setLoadError("Non riesco ad aprire la rubrica: controlla la connessione e riprova.");
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  const started = useRef(false);
  const ensureLoaded = useCallback(() => {
    if (started.current) return;
    started.current = true;
    void reload();
  }, [reload]);

  const index = useMemo<Indexed[]>(
    () => (data ? [...data.contacts].sort((a, b) => compareContacts(a, b, "nome")).map((c) => ({ c, key: searchKey(c), digits: c.phone.replace(/\D/g, "") })) : []),
    [data],
  );
  const byEmail = useMemo(() => new Map((data?.contacts ?? []).map((c) => [c.email, c])), [data]);

  const writeTo = useCallback(
    (ids: string[]) => {
      setPicked(new Set(ids));
      setMode("rubrica");
      setStep(0);
      setWriteNonce((x) => x + 1);
      setTab("scrivi");
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    },
    [setTab],
  );

  const value: Store = {
    tab,
    setTab,
    data,
    index,
    byEmail,
    loading,
    loadError,
    ensureLoaded,
    reload,
    contactCount: data ? data.contacts.length : contactCount,
    mode,
    setMode,
    step,
    setStep,
    picked,
    setPicked,
    writeNonce,
    writeTo,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
