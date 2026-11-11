-- Mail (solo aggiunte): quota del giorno, registro degli invii, disiscrizioni.
-- CreateTable
CREATE TABLE IF NOT EXISTS "MailDay" (
    "day" TEXT NOT NULL,
    "transactional" INTEGER NOT NULL DEFAULT 0,
    "bulk" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailDay_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MailSend" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "by" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "recipients" INTEGER NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "excluded" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'IN_CORSO',

    CONSTRAINT "MailSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MailSendChunk" (
    "sendId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailSendChunk_pkey" PRIMARY KEY ("sendId","idx")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MailOptOut" (
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,

    CONSTRAINT "MailOptOut_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MailSend_createdAt_idx" ON "MailSend"("createdAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MailSendChunk" ADD CONSTRAINT "MailSendChunk_sendId_fkey" FOREIGN KEY ("sendId") REFERENCES "MailSend"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
