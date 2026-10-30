import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ADMIN_WIDGETS, DEFAULT_THEME, EMPLOYEE_WIDGETS, KEY_IDLE_DAYS, WIDGET_THEMES, WIDGETS } from "@/lib/widgets";
import { AuthorizeList, DeviceList, Installer, PhoneQr, ThemePicker, WidgetGallery, type DeviceRow } from "./widget-client";

const themeOf = (t: string | null | undefined) => (WIDGET_THEMES.some((x) => x.id === t) ? (t as string) : DEFAULT_THEME);

export const metadata: Metadata = { title: "Widget sul telefono" };

export default async function WidgetPage() {
  const session = await getServerSession(authOptions);
  const isEmployee = session?.user?.role === "EMPLOYEE";

  if (isEmployee) {
    const emp = await prisma.employee.findUnique({ where: { id: session!.user!.employeeId! }, select: { id: true, name: true, widgets: true, widgetTheme: true } });
    const allowed = WIDGETS.filter((w) => emp?.widgets.includes(w.id));
    const devices = emp ? await prisma.widgetDevice.findMany({ where: { employeeId: emp.id, revokedAt: null }, orderBy: { createdAt: "desc" } }) : [];
    return (
      <Layout>
        {allowed.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface px-5 py-6 text-sm text-foreground-muted">
            Il titolare non ti ha ancora dato nessun widget. Quando lo farà, qui troverai la guida per metterli sulla Home del telefono.
          </div>
        ) : (
          <>
            <Installer ownerName={emp!.name} example={allowed[0].id} />
            <WidgetGallery widgets={allowed} theme={themeOf(emp?.widgetTheme)} />
            <ThemePicker current={themeOf(emp?.widgetTheme)} />
            <DeviceList devices={devices.map((d) => toRow(d, emp!.name))} title="I tuoi telefoni collegati" />
          </>
        )}
      </Layout>
    );
  }

  const [user, employees, devices, users] = await Promise.all([
    prisma.user.findUnique({ where: { username: session?.user?.username ?? "" }, select: { id: true, name: true, widgetTheme: true } }),
    prisma.employee.findMany({ where: { role: "EMPLOYEE", active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, widgets: true } }),
    prisma.widgetDevice.findMany({ where: { revokedAt: null }, orderBy: { createdAt: "desc" } }),
    prisma.user.findMany({ select: { id: true, name: true } }),
  ]);
  const names = new Map<string, string>([...users.map((u) => [u.id, u.name] as const), ...employees.map((e) => [e.id, e.name] as const)]);
  const rows = devices.map((d) => toRow(d, names.get(d.userId ?? d.employeeId ?? "") ?? "—"));
  return (
    <Layout>
      <Installer ownerName={user?.name ?? ""} example="aperture" />
      <WidgetGallery widgets={ADMIN_WIDGETS} theme={themeOf(user?.widgetTheme)} />
      <ThemePicker current={themeOf(user?.widgetTheme)} />
      <AuthorizeList employees={employees} widgets={EMPLOYEE_WIDGETS} />
      <DeviceList devices={rows} title="Telefoni collegati" showOwner />
    </Layout>
  );
}

function toRow(d: { id: string; name: string; createdAt: Date; lastUsedAt: Date | null; otherDeviceAt: Date | null; deviceName: string | null }, owner: string): DeviceRow {
  const last = d.lastUsedAt ?? d.createdAt;
  return {
    id: d.id,
    name: d.name,
    owner,
    createdAt: d.createdAt.toISOString(),
    lastUsedAt: d.lastUsedAt ? d.lastUsedAt.toISOString() : null,
    deviceName: d.deviceName,
    copied: !!d.otherDeviceAt,
    expiringSoon: Date.now() - last.getTime() > (KEY_IDLE_DAYS - 14) * 86_400_000,
  };
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Widget sul telefono</h1>
        <p className="text-sm text-foreground-muted">
          Riquadri sulla schermata Home dell&apos;iPhone che si aggiornano da soli e con un tocco aprono la pagina giusta. Funzionano con
          l&apos;app gratuita <b className="font-medium text-foreground">Scriptable</b>, su iPhone e iPad.
        </p>
      </div>
      <PhoneQr />
      {children}
    </div>
  );
}
