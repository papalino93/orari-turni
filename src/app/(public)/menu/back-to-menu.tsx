"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

// Pagina precedente nella stessa visita del menù (navigazione interna, senza ricaricare):
// la ricorda il layout, che resta lo stesso passando dal menù agli allergeni o a un evento.
let previousPath: string | null = null;
let currentPath: string | null = null;

export function MenuPathTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === currentPath) return;
    previousPath = currentPath;
    currentPath = pathname;
  }, [pathname]);
  return null;
}

// «← Torna al menù»: se si arriva dal menù, torna indietro, al punto in cui il cliente era
// (la pagina del menù è lunga: il link riportava in cima). Altrimenti (link condiviso, QR,
// pagina ricaricata) è un normale link al menù.
export function BackToMenu({ className, children }: { className: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <Link
      href="/menu"
      className={className}
      onClick={(e) => {
        if (previousPath !== "/menu" || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || window.history.length < 2) return;
        e.preventDefault();
        router.back();
      }}
    >
      {children}
    </Link>
  );
}
