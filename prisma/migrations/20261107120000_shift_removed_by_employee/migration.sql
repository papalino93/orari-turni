-- Turni del titolare tolti da un dipendente nella revisione del mese («Riposo» o «Svuota
-- giornata»): se ne tiene traccia, così chi approva il mese vede che c'era un turno.
CREATE TABLE IF NOT EXISTS "ShiftRemoval" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftRemoval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ShiftRemoval_employeeId_date_idx" ON "ShiftRemoval"("employeeId", "date");

DO $$ BEGIN
  ALTER TABLE "ShiftRemoval" ADD CONSTRAINT "ShiftRemoval_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
