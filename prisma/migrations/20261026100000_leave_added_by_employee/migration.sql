-- Permesso a ore segnato dal dipendente nella revisione del mese (il titolare lo vede come modifica del dipendente).
ALTER TABLE "LeaveEntry" ADD COLUMN IF NOT EXISTS "addedByEmployee" BOOLEAN NOT NULL DEFAULT false;
