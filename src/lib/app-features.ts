import { prisma } from "@/lib/prisma";

// Funzioni che il titolare accende o spegne da Account (es. «Mail», che finché
// l'invio non è collegato confonde più che aiutare). Salvate in MenuSetting "features".
export type AppFeatures = { mail: boolean };
const DEFAULTS: AppFeatures = { mail: false };

export async function loadFeatures(): Promise<AppFeatures> {
  const row = await prisma.menuSetting.findUnique({ where: { id: "features" } });
  if (!row) return DEFAULTS;
  try {
    return { ...DEFAULTS, ...(JSON.parse(row.value) as Partial<AppFeatures>) };
  } catch {
    return DEFAULTS;
  }
}
