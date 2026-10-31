"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { STAFF_DEVICE_KEY } from "../stats";
import { Ornament } from "../ornament";

type Stato = "attendi" | "fatto" | "annullato" | "impossibile";

export function StaffDeviceConfirm() {
  const [stato, setStato] = useState<Stato>("attendi");

  useEffect(() => {
    try {
      localStorage.setItem(STAFF_DEVICE_KEY, "1");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- il browser si legge solo qui
      setStato(localStorage.getItem(STAFF_DEVICE_KEY) === "1" ? "fatto" : "impossibile");
    } catch {
      setStato("impossibile");
    }
  }, []);

  function annulla() {
    try {
      localStorage.removeItem(STAFF_DEVICE_KEY);
      setStato("annullato");
    } catch {
      setStato("impossibile");
    }
  }
  function rifai() {
    try {
      localStorage.setItem(STAFF_DEVICE_KEY, "1");
      setStato("fatto");
    } catch {
      setStato("impossibile");
    }
  }

  const titolo =
    stato === "fatto"
      ? "Fatto: questo telefono non conta più"
      : stato === "annullato"
        ? "Questo telefono conta di nuovo"
        : stato === "impossibile"
          ? "Non ci sono riuscito"
          : "Un attimo…";

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-[#F4EEE3] px-6 py-10 text-center">
      <div className="menu-sans text-[11px] uppercase tracking-[0.34em] text-[#9C7A45]">L&apos;Angolo del Vino · Personale</div>
      {stato === "fatto" && (
        <div aria-hidden className="flex h-16 w-16 items-center justify-center rounded-full bg-[#6B1020] text-3xl text-[#F4EEE3]">
          ✓
        </div>
      )}
      <h1 className="menu-serif m-0 max-w-[340px] text-[34px] font-medium leading-tight text-[#6B1020]">{titolo}</h1>
      <Ornament color="#9C7A45" />
      <div className="max-w-[340px] space-y-3 text-[17px] leading-snug text-[#3F4540]">
        {stato === "fatto" && (
          <>
            <p className="m-0">
              Da adesso, quando apri il menù da questo telefono, <b>non entra nelle statistiche</b>: nemmeno quando inquadri il QR del locale.
            </p>
            <p className="m-0 text-[15px] text-[#6A6F6A]">
              Vale per questa app del telefono (di solito Safari). Se apri il menù anche da un&apos;altra, come Chrome, apri questo link anche lì. Va fatto una volta su
              ogni telefono del personale.
            </p>
          </>
        )}
        {stato === "annullato" && (
          <p className="m-0">Le aperture del menù da questo telefono tornano a contare nelle statistiche, come quelle di un cliente.</p>
        )}
        {stato === "impossibile" && (
          <p className="m-0">
            Il telefono non lascia salvare l&apos;impostazione: di solito succede in <b>navigazione privata</b>. Apri questo link in una finestra normale.
          </p>
        )}
      </div>
      {stato !== "attendi" && (
        <div className="flex flex-col items-center gap-3">
          <Link
            href="/menu"
            className="menu-sans flex min-h-12 items-center rounded-full bg-[#6B1020] px-7 text-[12px] font-medium uppercase tracking-[0.2em]"
            // Il colore va qui: i link del menù hanno il loro colore (menu.css) che vincerebbe sulla classe.
            style={{ color: "#F4EEE3" }}
          >
            Apri il menù
          </Link>
          {stato === "fatto" && (
            <button type="button" onClick={annulla} className="menu-sans min-h-11 text-[12px] text-[#6A6F6A] underline underline-offset-4">
              Annulla: fai contare di nuovo questo telefono
            </button>
          )}
          {stato === "annullato" && (
            <button type="button" onClick={rifai} className="menu-sans min-h-11 text-[12px] text-[#6B1020] underline underline-offset-4">
              Rifai: questo telefono non deve contare
            </button>
          )}
        </div>
      )}
    </main>
  );
}
