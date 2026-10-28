-- Settimana modificata dopo la conferma degli orari (la conferma va rifatta).
ALTER TABLE "WeekPlan" ADD COLUMN IF NOT EXISTS "changedAfterConfirmAt" TIMESTAMP(3);
