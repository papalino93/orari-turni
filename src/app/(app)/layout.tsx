import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { StaffDeviceMark } from "@/components/staff-device-mark";
import { loadFeatures } from "@/lib/app-features";
import { bookingsToDo, loadBookingSettings } from "@/lib/booking/service";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  // Non "=== 'ADMIN'": un cookie firmato prima dell'Area Dipendenti non ha
  // ancora questo campo, e appartiene per forza a titolare/consulente (quel
  // valore non esisteva prima) — vedi lo stesso ragionamento in lib/guard.ts.
  const role = session.user.role === "EMPLOYEE" ? "EMPLOYEE" : "ADMIN";

  // Titolare/consulente gestiscono sempre il menù; un dipendente solo se il
  // titolare gli ha dato il permesso (letto dal database, non dal token).
  let canEditMenu = role === "ADMIN";
  // Prenotazioni: titolare/consulente sempre, un dipendente solo con il permesso (dal database).
  let canManageBookings = role === "ADMIN";
  // App già installata (aperta almeno una volta dall'icona sulla Home): niente più inviti a installarla.
  let appInstalled = false;
  // «Telefono enoteca»: niente orari né ore, la sua sezione è Prenotazioni.
  let venueDevice = false;
  if (role === "EMPLOYEE" && session.user.employeeId) {
    const employee = await prisma.employee.findUnique({
      where: { id: session.user.employeeId },
      select: { canEditMenu: true, canManageBookings: true, active: true, appInstalledAt: true, isVenueDevice: true },
    });
    canEditMenu = Boolean(employee?.active && employee.canEditMenu);
    canManageBookings = Boolean(employee?.active && employee.canManageBookings);
    appInstalled = Boolean(employee?.appInstalledAt);
    venueDevice = Boolean(employee?.active && employee.isVenueDevice);
  } else if (role === "ADMIN") {
    const user = await prisma.user.findUnique({ where: { username: session.user.username }, select: { appInstalledAt: true } });
    appInstalled = Boolean(user?.appInstalledAt);
  }
  const features = role === "ADMIN" ? await loadFeatures() : { mail: false, ferie: false };
  // La voce «Prenotazioni» compare con l'agenda accesa (spenta, il titolare la raggiunge da
  // Impostazioni), con il numero delle cose da fare: richieste da confermare e messaggi da mandare.
  let bookings: { pending: number; whatsapp: number; incomplete: number } | null = null;
  if (canManageBookings && (await loadBookingSettings()).agendaEnabled) bookings = await bookingsToDo();

  return (
    <AppShell venueDevice={venueDevice} userName={session.user.name} role={role} canEditMenu={canEditMenu} appInstalled={appInstalled} showMail={features.mail} showFerie={features.ferie} bookings={bookings}>
      <StaffDeviceMark />
      {children}
    </AppShell>
  );
}
