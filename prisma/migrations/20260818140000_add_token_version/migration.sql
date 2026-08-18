-- Cambiare password (User.tokenVersion) o rigenerare le credenziali di un
-- dipendente (Employee.tokenVersion) invalida ora le sessioni già aperte
-- con la versione precedente — vedi il commento sui due campi in
-- schema.prisma e la logica in lib/auth.ts.
ALTER TABLE "User" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Employee" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;
