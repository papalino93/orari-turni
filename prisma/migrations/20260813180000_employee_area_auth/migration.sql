-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REOPENED');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "password" TEXT,
ADD COLUMN     "username" TEXT;

-- AlterTable
ALTER TABLE "ShiftBlock" ADD COLUMN     "addedByEmployee" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "editedByEmployeeAt" TIMESTAMP(3),
ADD COLUMN     "originalEndTime" TEXT,
ADD COLUMN     "originalStartTime" TEXT;

-- CreateTable
CREATE TABLE "MonthlySubmission" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlySubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthlySubmission_employeeId_idx" ON "MonthlySubmission"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlySubmission_employeeId_year_month_key" ON "MonthlySubmission"("employeeId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_username_key" ON "Employee"("username");

-- AddForeignKey
ALTER TABLE "MonthlySubmission" ADD CONSTRAINT "MonthlySubmission_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

