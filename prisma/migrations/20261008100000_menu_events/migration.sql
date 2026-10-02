-- Statistiche anonime del menù: una tabella nuova, vuota. Si riempie solo
-- quando il titolare accende «Inizia a contare».
CREATE TABLE "MenuEvent" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "day" TEXT NOT NULL,
    "hour" INTEGER NOT NULL,
    "weekday" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "target" TEXT,
    CONSTRAINT "MenuEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MenuEvent_day_idx" ON "MenuEvent"("day");
CREATE INDEX "MenuEvent_kind_day_idx" ON "MenuEvent"("kind", "day");
