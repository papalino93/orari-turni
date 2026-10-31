import { prisma } from "@/lib/prisma";

// Sezioni che il titolare accende o spegne da Impostazioni: «Mail» (finché l'invio non è
// collegato confonde più che aiutare) e «Ferie» (non ancora in uso). Salvate in MenuSetting "features".
export type AppFeatures = { mail: boolean; ferie: boolean };
const DEFAULTS: AppFeatures = { mail: false, ferie: false };

export async function loadFeatures(): Promise<AppFeatures> {
  const row = await prisma.menuSetting.findUnique({ where: { id: "features" } });
  if (!row) return DEFAULTS;
  try {
    return { ...DEFAULTS, ...(JSON.parse(row.value) as Partial<AppFeatures>) };
  } catch {
    return DEFAULTS;
  }
}
