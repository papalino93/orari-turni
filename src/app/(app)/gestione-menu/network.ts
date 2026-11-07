// Senza rete un'azione del server non risponde: la chiamata «esplode» e, senza
// questo involucro, i pulsanti restano bloccati su «Salvo…» o compare la pagina
// d'errore. Così diventa un errore normale, con un messaggio chiaro.

import { actionErrorMessage } from "@/components/toast";

export const NETWORK_ERROR = "Connessione assente: controlla la rete e riprova.";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function safeAction<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (e) {
    // Senza rete, o con il sito aggiornato mentre la pagina era aperta: il messaggio giusto per ognuno.
    return { ok: false, error: actionErrorMessage(e) };
  }
}
