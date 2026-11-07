import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { InstallaView } from "./installa-view";

// La guida vale per tutti; al dipendente serve anche la strada per tornare
// alle sue ore (per lui l'Area Dipendenti non ha un menù di sezioni).
export default async function InstallaPage() {
  const session = await getServerSession(authOptions);
  return <InstallaView backToMyHours={session?.user?.role === "EMPLOYEE"} />;
}
