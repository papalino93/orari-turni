-- Widget sulla Home (Scriptable): telefoni collegati e permessi dei dipendenti. Solo aggiunte.
ALTER TABLE "Employee" ADD COLUMN "widgets" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "WidgetDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "employeeId" TEXT,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "deviceName" TEXT,
    "otherDeviceAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "WidgetDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WidgetDevice_keyHash_key" ON "WidgetDevice"("keyHash");
CREATE INDEX "WidgetDevice_userId_idx" ON "WidgetDevice"("userId");
CREATE INDEX "WidgetDevice_employeeId_idx" ON "WidgetDevice"("employeeId");
