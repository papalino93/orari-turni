-- Giornate di chiusura del locale, stato di pubblicazione settimanale e
-- foto dipendente. Vedi i commenti nello schema Prisma per il razionale.

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "photoUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EmployeePhoto" (
    "employeeId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeePhoto_pkey" PRIMARY KEY ("employeeId")
);

-- AddForeignKey
ALTER TABLE "EmployeePhoto" ADD CONSTRAINT "EmployeePhoto_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ClosureDay" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "ClosureDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClosureDay_date_key" ON "ClosureDay"("date");

-- CreateTable
CREATE TABLE "WeekPlan" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeekPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeekPlan_weekStart_key" ON "WeekPlan"("weekStart");

-- Il codice ha sempre assunto al massimo una voce ferie/permesso/libero per
-- dipendente e giorno (saveDayEntry cancella e riscrive, la UI legge con
-- find). Senza vincolo però due salvataggi in parallelo possono lasciare
-- righe doppie: prima ripuliamo eventuali duplicati storici tenendo la più
-- recente, poi rendiamo l'assunzione un vincolo del database.
DELETE FROM "LeaveEntry" a
USING "LeaveEntry" b
WHERE a."employeeId" = b."employeeId"
  AND a."date" = b."date"
  AND (a."createdAt", a."id") < (b."createdAt", b."id");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveEntry_employeeId_date_key" ON "LeaveEntry"("employeeId", "date");
