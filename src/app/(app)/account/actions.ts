"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { assert, parseId, runAction, ValidationError, type ActionResult } from "@/lib/validation";

// I due account applicativi condividono gli stessi permessi per scelta di
// prodotto: chi ha effettuato l'accesso può reimpostare anche la password
// dell'altro (serve per il caso "ho dimenticato la password" descritto in
// /account). Quello che la funzione DEVE garantire è che nessuno possa
// invocarla senza essere autenticato: prima di questa modifica non
// verificava alcuna sessione, quindi userId era un parametro che chiunque
// poteva passare da un client arbitrario.
export async function setPassword(userIdInput: string, newPassword: string): Promise<ActionResult> {
  return runAction(async () => {
    await requireUser();
    const userId = parseId(userIdInput, "utente");

    if (typeof newPassword !== "string" || newPassword.length < 8) {
      throw new ValidationError("La password deve avere almeno 8 caratteri.");
    }
    if (newPassword.length > 200) {
      throw new ValidationError("Password troppo lunga.");
    }

    const target = await prisma.user.findUnique({ where: { id: userId } });
    assert(target, "Utente non trovato.");

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    revalidatePath("/account");
  });
}
