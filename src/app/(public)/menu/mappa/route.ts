import { NextResponse } from "next/server";
import { loadVenue } from "@/lib/menu";

// /mappa (link nei messaggi ai clienti): apre Google Maps sull'enoteca, con il nome e l'indirizzo
// scritti in Impostazioni → Orari e contatti. Su iPhone e Android si apre l'app delle mappe.
export async function GET(request: Request) {
  const { contacts } = await loadVenue();
  const address = (contacts.address ?? "").trim();
  const query = address ? `L'Angolo del Vino, ${address}` : "L'Angolo del Vino Scandicci";
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  void request;
  return NextResponse.redirect(url, 307);
}
