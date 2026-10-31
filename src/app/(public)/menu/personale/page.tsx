import type { Metadata } from "next";
import { StaffDeviceConfirm } from "./confirm";

// Il link «Il tuo telefono non deve contare» (Statistiche) porta qui: la pagina segna il browser
// come telefono del personale e lo dice chiaramente, invece di aprire il menù senza spiegazioni.
export const metadata: Metadata = { title: "Telefono del personale — L'Angolo del Vino" };

export default function StaffDevicePage() {
  return <StaffDeviceConfirm />;
}
