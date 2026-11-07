"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { phoneProblem } from "@/lib/booking/rules";
import { ChatIcon, ContactButtons, pillFilled } from "./ui";
import { PrivacyText } from "./privacy-text";

export type FormDay = {
  day: string;
  label: string; // «Sab 14 nov»
  relative: "Oggi" | "Domani" | null;
  long: string; // «oggi», «domani» o «sabato 14 novembre»
  full: string; // «sabato 14 novembre»
  state: "open" | "past" | "tooFar" | "closed" | "full" | "noSlots";
  reason: string | null;
  slots: { time: string; at: number }[];
  // Fine dell'ultima apertura del giorno (ms): dopo, il giorno è «Chiuso» e non più «Chiamaci».
  closeAt: number | null;
  events: { title: string; slug: string; startTime: string | null }[];
};

type Field = "people" | "day" | "time" | "name" | "phone" | "email" | "privacy";
type Contact = "whatsapp" | "email";

const DRAFT_KEY = "prenota-bozza";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NOTE_MAX = 300;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// Da tablet e computer i giorni stanno in una griglia: prima due settimane, poi «Altri giorni».
const WIDE_DAYS = 14;

// Gruppi di pulsanti-scelta: un solo Tab per gruppo, le frecce passano da una scelta all'altra
// (e la scelgono, come i pulsanti radio veri).
function rovingKeys(e: React.KeyboardEvent<HTMLElement>) {
  const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
  const back = e.key === "ArrowLeft" || e.key === "ArrowUp";
  if (!forward && !back && e.key !== "Home" && e.key !== "End") return;
  const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)')].filter((el) => el.getClientRects().length > 0);
  const i = items.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0 || !items.length) return;
  e.preventDefault();
  const n = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (forward ? 1 : -1) + items.length) % items.length;
  items[n].focus();
  items[n].click();
}

export function BookingForm({
  days,
  maxPeople,
  leadMinutes,
  serverNow,
  mailOn,
  stamp,
  source,
  event,
  tel,
  wa,
  groupWa,
  address,
  phone: venuePhone,
}: {
  days: FormDay[];
  maxPeople: number;
  leadMinutes: number;
  serverNow: number;
  mailOn: boolean;
  stamp: string;
  source: string;
  event: { slug: string; title: string; startTime: string | null } | null;
  tel: string | null;
  wa: string | null;
  groupWa: string | null;
  address: string;
  phone: string;
}) {
  const router = useRouter();
  const [now, setNow] = useState(serverNow);

  // Orari ancora prenotabili adesso: con la pagina aperta a lungo, quelli troppo vicini spariscono.
  const visibleDays = useMemo(
    () =>
      days.map((d) => {
        // Pagina aperta a lungo: dopo la chiusura di oggi, «Chiuso».
        if ((d.state === "open" || d.state === "noSlots") && d.closeAt !== null && now >= d.closeAt) return { ...d, state: "closed" as const, reason: null, slots: [] };
        if (d.state !== "open") return d;
        const slots = d.slots.filter((s) => s.at >= now + leadMinutes * 60000);
        return slots.length ? { ...d, slots } : { ...d, state: "noSlots" as const, slots: [] };
      }),
    [days, now, leadMinutes],
  );
  const eventDays = event ? visibleDays.filter((d) => d.events.some((e) => e.slug === event.slug)) : [];

  // Arrivando da un evento: il suo primo giorno prenotabile già scelto, e l'ora d'inizio se c'è.
  const initial = (() => {
    const d = eventDays.find((x) => x.state === "open");
    if (!d) return { day: null, time: null };
    const t = event?.startTime && d.slots.some((s) => s.time === event.startTime) ? event.startTime : null;
    return { day: d.day, time: t };
  })();

  const [people, setPeople] = useState<number | "more" | null>(null);
  const [day, setDay] = useState<string | null>(initial.day);
  const [time, setTime] = useState<string | null>(initial.time);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [contact, setContact] = useState<Contact>("whatsapp");
  const [email, setEmail] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [allergies, setAllergies] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [fakeDone, setFakeDone] = useState(false);
  const [moreDays, setMoreDays] = useState(() => days.findIndex((d) => d.day === initial.day) >= WIDE_DAYS);
  const trap = useRef<HTMLInputElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  // La bozza si salva solo dopo averla riletta (altrimenti la si cancellerebbe all'apertura).
  const [restored, setRestored] = useState(false);

  const selected = visibleDays.find((d) => d.day === day) ?? null;
  const validTime = selected?.slots.some((s) => s.time === time) ? time : null;
  const useEmail = mailOn && contact === "email";
  const blockedByGroup = people === "more";
  const blockedByDay = !blockedByGroup && selected?.state === "noSlots";

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    const id0 = setTimeout(() => setNow(Date.now()), 0);
    return () => {
      clearInterval(id);
      clearTimeout(id0);
    };
  }, []);

  // Bozza nella scheda: se la pagina si ricarica o si torna indietro, quello che si è scritto resta.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Record<string, unknown>;
        /* eslint-disable react-hooks/set-state-in-effect -- ripristino della bozza, una volta sola dopo il caricamento */
        if (typeof d.name === "string") setName(d.name);
        if (typeof d.phone === "string") setPhone(d.phone);
        if (typeof d.email === "string") setEmail(d.email);
        if (d.contact === "email" && mailOn) setContact("email");
        if (typeof d.note === "string" && d.note) {
          setNote(d.note.slice(0, NOTE_MAX));
          setNoteOpen(true);
        }
        if (typeof d.allergies === "boolean") setAllergies(d.allergies);
        if (typeof d.people === "number" && d.people >= 1 && d.people <= maxPeople) setPeople(d.people);
        if (!event && typeof d.day === "string" && days.some((x) => x.day === d.day && x.state === "open")) {
          setDay(d.day);
          if (typeof d.time === "string") setTime(d.time);
          if (days.findIndex((x) => x.day === d.day) >= WIDE_DAYS) setMoreDays(true);
        }
      }
    } catch {
      // niente bozza: si parte da zero
    }
    setRestored(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    // Solo all'apertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ name, phone, email, contact, note, allergies, people: typeof people === "number" ? people : null, day, time }));
    } catch {
      // memoria non disponibile: pazienza
    }
  }, [restored, name, phone, email, contact, note, allergies, people, day, time]);

  // Il giorno già scelto (da un evento o dalla bozza) si vede nella striscia, senza far scorrere la pagina.
  // Solo la prima volta: dopo, la striscia resta dove la si è lasciata.
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || !day) return;
    scrolled.current = true;
    const box = strip.current;
    const btn = box?.querySelector<HTMLElement>(`[data-day="${day}"]`);
    if (!box || !btn || box.scrollWidth <= box.clientWidth) return;
    box.scrollLeft = btn.offsetLeft - box.clientWidth / 2 + btn.clientWidth / 2;
  }, [day]);

  function clearError(f: Field) {
    setFormError(null);
    setErrors((e) => (e[f] ? { ...e, [f]: undefined } : e));
  }

  function showError(field: Field | null, message: string) {
    if (!field) {
      setFormError(message);
      requestAnimationFrame(() => document.getElementById("errore-invio")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
      return;
    }
    setErrors({ [field]: message });
    requestAnimationFrame(() => {
      const el = document.getElementById(`campo-${field}`);
      if (!el) return;
      el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      const input = el.querySelector<HTMLElement>("input:not([type=hidden]), textarea");
      if (input && (field === "name" || field === "phone" || field === "email")) input.focus({ preventScroll: true });
    });
  }

  function validate(): [Field, string] | null {
    if (typeof people !== "number") return ["people", "Scegli quante persone."];
    if (!selected) return ["day", "Scegli il giorno."];
    if (!validTime) return ["time", "Scegli l'ora."];
    if (name.trim().length < 2) return ["name", "Scrivi il tuo nome."];
    // Gli stessi controlli (e gli stessi messaggi) del server: un numero sbagliato è una risposta che non arriva.
    const phoneError = phoneProblem(phone.trim(), useEmail ? "email" : "whatsapp");
    if (phoneError) return ["phone", phoneError];
    if (useEmail && !EMAIL.test(email.trim())) return ["email", email.trim() ? "L'indirizzo email non sembra giusto: controllalo." : "Scrivi la tua email."];
    if (!privacy) return ["privacy", "Per inviare la richiesta, spunta la casella qui sopra."];
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setFormError(null);
    const problem = validate();
    if (problem) {
      showError(problem[0], problem[1]);
      return;
    }
    setErrors({});
    setSending(true);
    let res: Response;
    try {
      res = await fetch("/menu/prenota/invia", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          people,
          day,
          time: validTime,
          name: name.trim(),
          phone: phone.trim(),
          contact: useEmail ? "email" : "whatsapp",
          email: useEmail ? email.trim() : "",
          note: note.trim(),
          allergies,
          privacy,
          source,
          event: event?.slug ?? "",
          t: stamp,
          sito: trap.current?.value ?? "",
        }),
      });
    } catch {
      setSending(false);
      setFormError("Non riesco a inviare: controlla la connessione e riprova.");
      return;
    }
    let data: { ok?: boolean; fake?: boolean; statusPath?: string; error?: string; field?: Field | null } = {};
    try {
      data = await res.json();
    } catch {
      // risposta non leggibile: messaggio generico qui sotto
    }
    if (data.ok && data.fake) {
      setFakeDone(true);
      return;
    }
    if (data.ok && data.statusPath) {
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // niente
      }
      // replace: con «indietro» non si torna al modulo già inviato.
      router.replace(data.statusPath);
      return;
    }
    setSending(false);
    const field = data.field && ["people", "day", "time", "name", "phone", "email", "privacy"].includes(data.field) ? data.field : null;
    showError(field, data.error || "Qualcosa non ha funzionato: riprova tra poco.");
    // Giorno o ora non più disponibili: si ricaricano giorni e orari, quello che si è scritto resta.
    if (field === "day" || field === "time") router.refresh();
  }

  if (fakeDone) {
    return (
      <div className="mt-10 rounded-2xl border bg-[#FBF7EF] p-6 text-center">
        <p className="menu-serif m-0 text-[28px] text-[#6B1020]">Richiesta inviata</p>
        <p className="m-0 mt-2 text-[16.5px] text-[#3F4540]">Ti rispondiamo noi appena possibile.</p>
      </div>
    );
  }

  const daysOpen = visibleDays.some((d) => d.state === "open");
  const firstPickable = visibleDays.find((d) => d.state === "open" || d.state === "noSlots") ?? null;
  const eventNote =
    event && !eventDays.some((d) => d.state === "open")
      ? eventDays.length === 0
        ? "Per questa serata non si può chiedere un tavolo da qui: chiamaci o scrivici. Oppure chiedi un tavolo per un altro giorno qui sotto."
        : "Per questa serata non ci sono più tavoli da chiedere online: chiamaci o scrivici. Oppure chiedi un tavolo per un altro giorno qui sotto."
      : null;

  return (
    <form onSubmit={submit} noValidate className="mt-8">
      {eventNote && (
        <div className="mb-2 rounded-2xl border bg-[#FBF7EF] px-5 py-4 text-center">
          <p className="m-0 text-balance text-[16.5px] leading-normal text-[#3F4540]">{eventNote}</p>
          <ContactButtons tel={tel} wa={wa} className="mt-3" />
        </div>
      )}

      {/* Campo trappola: nascosto alle persone (e ai lettori di schermo), lo riempiono solo i programmi. */}
      <div aria-hidden className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label>
          Lascia vuoto
          <input ref={trap} type="text" name="sito" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <Step n="I" id="campo-people" title="Quante persone?" error={errors.people}>
        <div role="radiogroup" aria-label="Quante persone" onKeyDown={rovingKeys} className="grid grid-cols-5 gap-2">
          {Array.from({ length: maxPeople }, (_, i) => i + 1).map((n) => (
            <Choice
              key={n}
              on={people === n}
              tab={people === n || (people === null && n === 1)}
              onClick={() => {
                setPeople(n);
                clearError("people");
              }}
              className="h-12 text-[18px]"
              label={`${n} ${n === 1 ? "persona" : "persone"}`}
            >
              {n}
            </Choice>
          ))}
          <Choice
            on={people === "more"}
            tab={people === "more"}
            onClick={() => {
              setPeople("more");
              clearError("people");
            }}
            className="col-span-5 h-12 text-[12px] uppercase tracking-[0.16em]"
          >
            Più di {maxPeople}
          </Choice>
        </div>
      </Step>

      {blockedByGroup ? (
        <CallBox
          title="Per i gruppi ci organizziamo meglio a voce"
          text={`Per più di ${maxPeople} persone chiamaci o scrivici su WhatsApp: troviamo insieme il tavolo giusto.`}
          tel={tel}
          wa={groupWa}
        />
      ) : (
        <>
          <Step n="II" id="campo-day" title="Che giorno?" error={errors.day}>
            {!daysOpen ? (
              <CallBox
                title="Nessun giorno disponibile"
                text="In questi giorni non si può chiedere un tavolo online: chiamaci o scrivici."
                tel={tel}
                wa={wa}
                flat
              />
            ) : (
              <>
                <div
                  ref={strip}
                  role="radiogroup"
                  aria-label="Giorno"
                  onKeyDown={rovingKeys}
                  className="-mx-6 flex snap-x gap-2 overflow-x-auto scroll-px-6 px-6 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-7 sm:overflow-visible sm:px-0"
                >
                  {visibleDays.map((d, i) => (
                    <DayCard
                      key={d.day}
                      d={d}
                      on={d.day === day}
                      tab={d.day === day || (!selected && d === firstPickable)}
                      // Da tablet e computer: le prime due settimane, il resto con «Altri giorni».
                      wideHidden={!moreDays && i >= WIDE_DAYS}
                      eventSlug={event?.slug ?? null}
                      onPick={() => {
                        setDay(d.day);
                        clearError("day");
                        if (!d.slots.some((s) => s.time === time)) setTime(null);
                      }}
                    />
                  ))}
                </div>
                {!moreDays && visibleDays.length > WIDE_DAYS && (
                  <div className="mt-3 hidden justify-center sm:flex">
                    <button
                      type="button"
                      onClick={() => setMoreDays(true)}
                      className="menu-sans flex min-h-11 items-center px-3 text-[12px] font-medium uppercase tracking-[0.18em] text-[#6B1020] underline underline-offset-4"
                    >
                      Altri giorni
                    </button>
                  </div>
                )}
                {selected && (
                  <div className="mt-3 text-center">
                    <div className="menu-serif text-[22px] font-medium leading-tight text-[#1F2621]">
                      {selected.relative ? `${selected.relative}, ${selected.full}` : cap(selected.full)}
                    </div>
                    {selected.events.map((e) => (
                      <div key={e.slug} className="menu-sans mt-1 flex items-center justify-center gap-1.5 text-[13px] text-[#7A5A22]">
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#C9A96E]" />
                        {e.title}
                        {e.startTime ? ` · dalle ${e.startTime}` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </Step>

          {daysOpen && (
            <Step n="III" id="campo-time" title="A che ora?" error={errors.time}>
              {!selected ? (
                <p className="m-0 text-[16px] italic text-[#5B605A]">Scegli prima il giorno.</p>
              ) : blockedByDay ? (
                <CallBox
                  title={selected.relative === "Oggi" ? "Per stasera chiamaci" : "Chiamaci"}
                  text={
                    selected.relative === "Oggi"
                      ? "Per oggi è tardi per prenotare online: chiamaci direttamente, ti diciamo subito se c'è posto."
                      : "Quel giorno non ci sono orari da chiedere online: chiamaci o scrivici."
                  }
                  tel={tel}
                  wa={wa}
                  flat
                />
              ) : (
                <div role="radiogroup" aria-label="Ora" onKeyDown={rovingKeys} className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {selected.slots.map((s, i) => (
                    <Choice
                      key={s.time}
                      on={validTime === s.time}
                      tab={validTime === s.time || (!validTime && i === 0)}
                      onClick={() => {
                        setTime(s.time);
                        clearError("time");
                      }}
                      className="h-12 text-[16px]"
                    >
                      {s.time}
                    </Choice>
                  ))}
                </div>
              )}
            </Step>
          )}

          {daysOpen && !blockedByDay && (
            <>
              <Step n="IV" title="I tuoi dati">
                <div className="flex flex-col gap-5">
                  <TextField
                    id="campo-name"
                    label="Nome"
                    value={name}
                    onChange={(v) => {
                      setName(v);
                      clearError("name");
                    }}
                    error={errors.name}
                    autoComplete="name"
                    maxLength={80}
                    placeholder="Il nome per il tavolo"
                  />
                  <TextField
                    id="campo-phone"
                    label="Telefono"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(v) => {
                      setPhone(v);
                      clearError("phone");
                    }}
                    error={errors.phone}
                    autoComplete="tel"
                    maxLength={40}
                    placeholder="Es. 333 123 4567"
                    hint={!useEmail ? "Ti rispondiamo su WhatsApp a questo numero." : "Ci serve per chiamarti se c'è bisogno."}
                  />

                  {mailOn && (
                    <fieldset className="m-0 border-0 p-0">
                      <legend className="menu-sans mb-2 p-0 text-[13px] font-medium text-[#3F4540]">Come preferisci la risposta?</legend>
                      <div role="radiogroup" aria-label="Come preferisci la risposta?" onKeyDown={rovingKeys} className="grid grid-cols-2 gap-2">
                        <Choice on={contact === "whatsapp"} tab={contact === "whatsapp"} onClick={() => setContact("whatsapp")} className="h-12 gap-2 text-[15px]">
                          <ChatIcon /> WhatsApp
                        </Choice>
                        <Choice
                          on={contact === "email"}
                          tab={contact === "email"}
                          onClick={() => {
                            setContact("email");
                            clearError("email");
                          }}
                          className="h-12 gap-2 text-[15px]"
                        >
                          <MailIcon /> Email
                        </Choice>
                      </div>
                    </fieldset>
                  )}

                  {useEmail && (
                    <TextField
                      id="campo-email"
                      label="Email"
                      type="email"
                      inputMode="email"
                      value={email}
                      onChange={(v) => {
                        setEmail(v);
                        clearError("email");
                      }}
                      error={errors.email}
                      autoComplete="email"
                      maxLength={254}
                      placeholder="nome@esempio.it"
                      hint="Ti rispondiamo a questo indirizzo."
                    />
                  )}

                  <div>
                    <button
                      type="button"
                      aria-expanded={noteOpen}
                      aria-controls="campo-note"
                      onClick={() => setNoteOpen((v) => !v)}
                      className="menu-sans flex min-h-11 items-center gap-2 text-[14px] font-medium text-[#6B1020]"
                    >
                      <span aria-hidden className="inline-flex h-6 w-6 items-center justify-center rounded-full border !border-[#6B1020] text-[16px] leading-none">
                        {noteOpen ? "−" : "+"}
                      </span>
                      {noteOpen ? "Nascondi la nota" : note.trim() ? "Nota aggiunta: modificala" : "Aggiungi una nota"}
                    </button>
                    {noteOpen && (
                      <div id="campo-note" className="mt-2">
                        <textarea
                          aria-label="Nota"
                          value={note}
                          maxLength={NOTE_MAX}
                          rows={3}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Es. un seggiolone, un compleanno, un tavolo tranquillo…"
                          className="menu-sans block w-full resize-y rounded-xl border bg-[#FBF7EF] px-4 py-3 text-[16px] leading-snug text-[#1F2621] outline-none placeholder:text-[#8A8F88] focus:!border-[#6B1020]"
                        />
                        <div className="menu-sans mt-1 flex justify-between gap-3 text-[12px] text-[#5B605A]">
                          <span>Per le allergie usa la domanda qui sotto.</span>
                          <span className="flex-none tabular-nums">
                            {note.length}/{NOTE_MAX}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={allergies}
                    onClick={() => setAllergies((v) => !v)}
                    className="flex w-full items-center gap-4 rounded-2xl border bg-[#FBF7EF] px-4 py-3.5 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[17px] font-medium leading-snug text-[#1F2621]">Qualcuno ha allergie o intolleranze?</span>
                      <span className="menu-sans mt-0.5 block text-[13px] leading-snug text-[#5B605A]">
                        {allergies ? "Sì: ne parliamo al tavolo." : "Ne parliamo al tavolo: qui basta un sì."}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={`relative h-7 w-12 flex-none rounded-full transition-colors ${allergies ? "bg-[#6B1020]" : "bg-[#D9CEBC]"}`}
                    >
                      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[left] ${allergies ? "left-[22px]" : "left-0.5"}`} />
                    </span>
                  </button>
                </div>
              </Step>

              <div id="campo-privacy" className="mt-8">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={privacy}
                    onChange={(e) => {
                      setPrivacy(e.target.checked);
                      clearError("privacy");
                    }}
                    aria-invalid={Boolean(errors.privacy)}
                    aria-describedby={errors.privacy ? "errore-privacy" : undefined}
                    className="mt-0.5 h-[22px] w-[22px] flex-none accent-[#6B1020]"
                  />
                  <span className="text-[16.5px] leading-snug text-[#1F2621]">
                    Ho letto l&apos;
                    <a
                      href="/menu/prenota/privacy"
                      onClick={(e) => {
                        e.preventDefault();
                        setPrivacyOpen(true);
                      }}
                      className="underline underline-offset-4"
                    >
                      informativa sulla privacy
                    </a>
                  </span>
                </label>
                {errors.privacy && (
                  <p id="errore-privacy" role="alert" className="menu-sans m-0 mt-2 text-[13.5px] font-medium text-[#A11B1B]">
                    {errors.privacy}
                  </p>
                )}
              </div>

              <div className="mt-9">
                {typeof people === "number" && selected && validTime && (
                  <p className="m-0 mb-3 text-center text-[17px] text-[#3F4540]">
                    {cap(selected.long)} alle {validTime} · {people} {people === 1 ? "persona" : "persone"}
                  </p>
                )}
                <button type="submit" disabled={sending} className={`${pillFilled} min-h-14 w-full text-[13px] tracking-[0.2em]`}>
                  {sending ? "Invio in corso…" : "Invia la richiesta"}
                </button>
                {formError && (
                  <p id="errore-invio" role="alert" className="menu-sans m-0 mt-3 scroll-mb-6 text-center text-[14px] font-medium text-[#A11B1B]">
                    {formError}
                  </p>
                )}
                <p className="m-0 mt-3 text-center text-[15.5px] italic text-[#5B605A]">Non è ancora una conferma: ti rispondiamo noi.</p>
              </div>
            </>
          )}
        </>
      )}

      {privacyOpen && <PrivacySheet onClose={() => setPrivacyOpen(false)} address={address} phone={venuePhone} />}
    </form>
  );
}

function Step({ n, id, title, error, children }: { n: string; id?: string; title: string; error?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-10 scroll-mt-6" aria-labelledby={id ? `${id}-titolo` : undefined}>
      <div className="mb-3.5 flex items-baseline gap-3">
        <span aria-hidden className="menu-serif w-6 flex-none text-[18px] font-medium italic text-[#9C7A45]">
          {n}
        </span>
        <h2 id={id ? `${id}-titolo` : undefined} className="menu-serif m-0 text-[27px] font-medium leading-tight text-[#6B1020]">
          {title}
        </h2>
      </div>
      {children}
      {error && (
        <p role="alert" className="menu-sans m-0 mt-2.5 text-[13.5px] font-medium text-[#A11B1B]">
          {error}
        </p>
      )}
    </section>
  );
}

function Choice({
  on,
  tab,
  onClick,
  className = "",
  label,
  children,
}: {
  on: boolean;
  // L'unica scelta del gruppo raggiungibile con Tab (quella scelta, o la prima).
  tab: boolean;
  onClick: () => void;
  className?: string;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      tabIndex={tab ? 0 : -1}
      aria-label={label}
      onClick={onClick}
      className={`menu-sans inline-flex items-center justify-center rounded-full border font-medium tabular-nums transition-colors ${
        on ? "!border-[#6B1020] bg-[#6B1020] text-[#F4EEE3]" : "bg-[#FBF7EF] text-[#1F2621] active:bg-[#EFE6D6]"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function DayCard({
  d,
  on,
  tab,
  wideHidden,
  eventSlug,
  onPick,
}: {
  d: FormDay;
  on: boolean;
  tab: boolean;
  wideHidden: boolean;
  eventSlug: string | null;
  onPick: () => void;
}) {
  // Si può scegliere un giorno aperto, oppure oggi anche se è tardi (si spiega di chiamare).
  const pickable = d.state === "open" || d.state === "noSlots";
  const [wd, num, mon] = d.label.split(" ");
  const status =
    d.state === "closed" ? d.reason || "Chiuso" : d.state === "full" ? "Completo" : d.state === "noSlots" ? "Chiamaci" : null;
  const ev = d.events[0];
  const isTheEvent = Boolean(eventSlug && d.events.some((e) => e.slug === eventSlug));
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      tabIndex={tab ? 0 : -1}
      data-day={d.day}
      disabled={!pickable}
      onClick={onPick}
      aria-label={`${d.long}${status ? `, ${status.toLowerCase()}` : ""}${ev ? `, ${ev.title}` : ""}`}
      // Sotto i 380 px le carte sono un po' più strette: si vede metà della quinta e si capisce che si scorre.
      className={`flex min-h-[118px] w-[76px] flex-none snap-start flex-col items-center rounded-2xl border px-0.5 pb-2 pt-2.5 text-center transition-colors max-[380px]:w-[66px] sm:w-auto ${wideHidden ? "sm:hidden" : ""} ${
        on
          ? "!border-[#6B1020] bg-[#6B1020] text-[#F4EEE3]"
          : pickable
            ? `bg-[#FBF7EF] text-[#1F2621] ${isTheEvent ? "!border-[#C9A96E]" : ""}`
            : "bg-transparent text-[#8A8F88] [border-style:dashed]"
      }`}
    >
      <span className={`menu-sans text-[12px] font-medium uppercase tracking-[0.06em] ${on ? "text-[#E3D4BC]" : pickable ? "text-[#5B605A]" : ""}`}>
        {d.relative ?? wd}
      </span>
      <span className="menu-serif text-[30px] font-medium leading-[1.05]">{num}</span>
      <span className={`menu-sans text-[12px] ${on ? "text-[#E3D4BC]" : pickable ? "text-[#5B605A]" : ""}`}>{mon}</span>
      {status ? (
        <span className={`menu-sans mt-1 line-clamp-2 px-0.5 text-[12px] font-medium leading-tight ${on ? "text-[#F4EEE3]" : d.state === "noSlots" ? "text-[#6B1020]" : ""}`}>
          {status}
        </span>
      ) : ev ? (
        <span className={`menu-sans mt-1 flex w-full flex-col items-center gap-[3px] text-[12px] leading-tight ${on ? "text-[#F3E3B5]" : "text-[#7A5A22]"}`}>
          <span aria-hidden className="h-1.5 w-1.5 flex-none rounded-full bg-[#C9A96E]" />
          <span lang="it" className="line-clamp-2 w-full break-words tracking-[-0.02em] [hyphens:auto]">{ev.title}</span>
        </span>
      ) : null}
    </button>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  type = "text",
  inputMode,
  autoComplete,
  maxLength,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  maxLength?: number;
  placeholder?: string;
}) {
  const inputId = `${id}-input`;
  return (
    <div id={id} className="scroll-mt-6">
      <label htmlFor={inputId} className="menu-sans mb-1.5 block text-[13px] font-medium text-[#3F4540]">
        {label}
      </label>
      <input
        id={inputId}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-errore` : hint ? `${id}-aiuto` : undefined}
        className={`menu-sans block min-h-12 w-full rounded-xl border bg-[#FBF7EF] px-4 text-[17px] text-[#1F2621] outline-none placeholder:text-[#8A8F88] focus:!border-[#6B1020] ${
          error ? "!border-[#A11B1B]" : ""
        }`}
      />
      {error ? (
        <p id={`${id}-errore`} role="alert" className="menu-sans m-0 mt-1.5 text-[13.5px] font-medium text-[#A11B1B]">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-aiuto`} className="menu-sans m-0 mt-1.5 text-[12.5px] text-[#5B605A]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

// Riquadro «chiamaci» con i pulsanti ben in vista (gruppi grandi, oggi è tardi, niente giorni liberi).
function CallBox({ title, text, tel, wa, flat = false }: { title: string; text: string; tel: string | null; wa: string | null; flat?: boolean }) {
  return (
    <div className={`${flat ? "" : "mt-6"} rounded-2xl border !border-[#C9A96E] bg-[#FBF7EF] px-5 py-6 text-center`}>
      <p className="menu-serif m-0 text-balance text-[25px] font-medium leading-tight text-[#6B1020]">{title}</p>
      <p className="m-0 mx-auto mt-2 max-w-[380px] text-balance text-[16.5px] leading-normal text-[#3F4540]">{text}</p>
      <ContactButtons tel={tel} wa={wa} className="mt-5" />
      {!tel && !wa && <p className="menu-sans m-0 mt-3 text-[13px] text-[#5B605A]">Trovi i nostri contatti in fondo alla pagina.</p>}
    </div>
  );
}

function PrivacySheet({ onClose, address, phone }: { onClose: () => void; address: string; phone: string }) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      html.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#26040A]/45 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-titolo"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88svh] w-full max-w-[620px] flex-col overflow-hidden rounded-t-[22px] bg-[#F4EEE3] shadow-[0_-8px_40px_rgba(38,4,10,0.25)] sm:rounded-[22px]"
      >
        <div className="flex items-center justify-between gap-3 border-b px-6 py-3.5">
          <h2 id="privacy-titolo" className="menu-serif m-0 text-[26px] font-medium text-[#6B1020]">
            I tuoi dati
          </h2>
          <button
            ref={closeBtn}
            type="button"
            onClick={onClose}
            className="menu-sans flex min-h-11 items-center px-1 text-[11px] font-medium uppercase tracking-[0.2em] text-[#6B1020]"
          >
            Chiudi
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-6 pb-4 pt-4">
          <PrivacyText address={address} phone={phone} />
        </div>
        <div className="border-t px-6 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
          <button type="button" onClick={onClose} className={`${pillFilled} w-full`}>
            Ho capito
          </button>
        </div>
      </div>
    </div>
  );
}

function MailIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
