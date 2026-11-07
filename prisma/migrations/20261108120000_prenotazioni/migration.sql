-- Prenotazioni online (solo aggiunte): richieste, cronologia, serate al completo,
-- iscrizioni alle notifiche e permesso «Può gestire le prenotazioni».
-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'PROPOSED', 'CONFIRMED', 'DECLINED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "canManageBookings" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "BookingRequest" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "day" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "people" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "contact" TEXT NOT NULL DEFAULT 'whatsapp',
    "note" TEXT,
    "allergies" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "promoId" TEXT,
    "proposedTime" TEXT,
    "proposedStartsAt" TIMESTAMP(3),
    "staffMessage" TEXT,
    "handledAt" TIMESTAMP(3),
    "handledBy" TEXT,
    "cancelledBy" TEXT,
    "arrivedAt" TIMESTAMP(3),
    "noShowAt" TIMESTAMP(3),
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BookingLog" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT,

    CONSTRAINT "BookingLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BookingClosedDay" (
    "day" TEXT NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingClosedDay_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "username" TEXT,
    "employeeId" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOkAt" TIMESTAMP(3),
    "failCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BookingRequest_code_key" ON "BookingRequest"("code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BookingRequest_tokenHash_key" ON "BookingRequest"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BookingRequest_status_startsAt_idx" ON "BookingRequest"("status", "startsAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BookingRequest_day_idx" ON "BookingRequest"("day");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BookingRequest_phone_createdAt_idx" ON "BookingRequest"("phone", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BookingRequest_ipHash_createdAt_idx" ON "BookingRequest"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BookingRequest_promoId_idx" ON "BookingRequest"("promoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BookingLog_requestId_at_idx" ON "BookingLog"("requestId", "at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PushSubscription_username_idx" ON "PushSubscription"("username");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PushSubscription_employeeId_idx" ON "PushSubscription"("employeeId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "MenuPromo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "BookingLog" ADD CONSTRAINT "BookingLog_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "BookingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


