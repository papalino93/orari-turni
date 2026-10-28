-- Chi ha già l'app installata non vede più l'invito a installarla.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "appInstalledAt" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "appInstalledAt" TIMESTAMP(3);
