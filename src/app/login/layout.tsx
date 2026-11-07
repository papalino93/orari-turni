import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Pagina di accesso con l'accesso già fatto (link salvato, tasto Indietro): si va
// direttamente alla propria area invece di rivedere il modulo. "/" manda ognuno alla
// sua prima sezione (vedi proxy.ts). Una sessione superata (password cambiata) qui
// risulta senza utente, quindi il modulo resta visibile per rientrare.
export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/");
  return children;
}
